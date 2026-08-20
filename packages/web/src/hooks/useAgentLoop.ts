import { useCallback, useState } from "react";
import type { AgentMessage, MessageContent, PageCardWithCard, PageWithCards, StackData } from "@wattle/shared";
import { defaultMetadata, flattenToPlainText, htmlToDoc } from "@wattle/shared";
import * as api from "../api/client.js";
import { getCardTypeId } from "../lib/getCardTypeId.js";
import { buildAgentToolDefinitions, toolInputToJobParams, type PageCardLookup } from "../lib/agentToolCatalog.js";
import type { StepOutput } from "../lib/actionJobRegistry.js";
import { t } from "../i18n/index.js";

/** Rounds cap (Brilliantly Simple Generation Agent plan, Phase 4) — a runaway loop
 *  (model keeps calling tools forever) stops here rather than running unbounded. */
const MAX_ROUNDS = 20;

/** How much of a Card's own plain-text content rides along in context — long enough
 *  for the model to actually work with, short enough that a page full of long Cards
 *  doesn't blow the context window every single round (the whole page context is
 *  rebuilt fresh each run, not incrementally). */
const CONTENT_SNIPPET_LENGTH = 500;

export type AgentScope = "page" | "cards";

export interface AgentProgressEvent {
  /** A short assistant status line this round, if the model included one alongside
   *  (or instead of) its tool calls. */
  text?: string;
  /** Tool (job) names the model asked to run this round, in call order — empty on
   *  the final round, which never has any. */
  toolNames: string[];
}

export type AgentRunOutcome =
  | { status: "done"; text: string }
  | { status: "max_rounds" }
  | { status: "aborted" }
  /** A `createCard` tool call with `typeId: "input"` landed — same "stop and let a
   *  human answer it" rule the AUTORUN chain this replaces already followed for
   *  input cards (App.tsx's old onGenerationAccepted). Resuming automatically once
   *  answered is real future work (Phase 4's own "v1.1"), not this pass. */
  | { status: "paused_for_input" };

export interface RunAgentInput {
  scope: AgentScope;
  instruction: string;
  page: PageWithCards;
  /** Required, and only meaningful, for scope: "cards" — the Cards actually in
   *  scope to mutate; the rest of the Page rides along in context for orientation
   *  only (see buildCardsContextText below). */
  selectedCards?: PageCardWithCard[];
  /** The same ActionJobContext-bound dispatcher App.tsx already builds
   *  (handleRunActionJob) — this hook doesn't duplicate App-level state
   *  (navigation, generation, Template-opening) to build its own. */
  onRunActionJob: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => Promise<StepOutput | void>;
  onProgress?: (event: AgentProgressEvent) => void;
  signal: AbortSignal;
}

export interface UseAgentLoopResult {
  running: boolean;
  error: string | null;
  runAgent: (input: RunAgentInput) => Promise<AgentRunOutcome>;
}

function plainText(html: string): string {
  return flattenToPlainText(htmlToDoc(html)).text.trim();
}

function snippet(text: string): string {
  return text.length > CONTENT_SNIPPET_LENGTH ? `${text.slice(0, CONTENT_SNIPPET_LENGTH)}…` : text;
}

/** Every Stack on the Page, fetched once up front (not re-fetched per round — this
 *  loop reassembles context only at the very start of a run, same "no session DB,
 *  no incremental re-sync" simplicity the plan calls for) — cardId → its members, so
 *  a Stack's own alternates (and their ids) are visible in context too, per the
 *  plan's "+ stack members if stack". */
async function fetchStackDataByCardId(page: PageWithCards): Promise<Map<string, StackData>> {
  const stackCards = page.pageCards.filter((pc) => getCardTypeId(pc.card) === "stack");
  const entries = await Promise.all(stackCards.map(async (pc) => [pc.card.id, await api.getStack(pc.card.id)] as const));
  return new Map(entries);
}

function describeCard(pc: PageCardWithCard, stackData: Map<string, StackData>): string {
  const typeId = getCardTypeId(pc.card);
  const title = pc.draftTitle ?? pc.card.title;
  const content = pc.draftContent ?? pc.card.content;
  const header = `[pageCardId=${pc.id}] [cardId=${pc.card.id}] [type=${typeId}] ${title || t("common.untitled")}`;
  const lines = [header];
  const text = snippet(plainText(content));
  if (text) lines.push(text);
  if (typeId === "stack") {
    for (const member of stackData.get(pc.card.id)?.members ?? []) {
      const memberTitle = member.draftTitle ?? member.card.title;
      lines.push(`  member [memberId=${member.id}] [cardId=${member.card.id}] ${memberTitle || t("common.untitled")}`);
    }
  }
  return lines.join("\n");
}

function describeCardCompact(pc: PageCardWithCard): string {
  const title = pc.draftTitle ?? pc.card.title;
  return `[pageCardId=${pc.id}] [cardId=${pc.card.id}] [type=${getCardTypeId(pc.card)}] ${title || t("common.untitled")}`;
}

async function buildPageContextText(page: PageWithCards): Promise<string> {
  const stackData = await fetchStackDataByCardId(page);
  if (page.pageCards.length === 0) return "Page cards: (none yet — this page is empty)";
  return ["Page cards:", ...page.pageCards.map((pc) => describeCard(pc, stackData))].join("\n\n");
}

async function buildCardsContextText(page: PageWithCards, selectedCards: PageCardWithCard[]): Promise<string> {
  const selectedIds = new Set(selectedCards.map((pc) => pc.id));
  const stackData = await fetchStackDataByCardId(page);
  const parts = [
    "In-scope cards (only mutate these):",
    ...selectedCards.map((pc) => describeCard(pc, stackData)),
  ];
  const rest = page.pageCards.filter((pc) => !selectedIds.has(pc.id)).map(describeCardCompact);
  if (rest.length > 0) {
    parts.push("", "Rest of the page (for orientation only — do not mutate unless also listed above):", ...rest);
  }
  return parts.join("\n\n");
}

function buildPageCardLookup(page: PageWithCards): PageCardLookup {
  const byId = new Map(page.pageCards.map((pc) => [pc.id, { cardId: pc.card.id, title: pc.draftTitle ?? pc.card.title }]));
  return { get: (pageCardId) => byId.get(pageCardId) };
}

/** Jobs assume a "host" pageCard argument (mirroring every existing call site —
 *  Action card Run, AUTORUN) even though the agent's own real targets always come
 *  from a tool call's own explicit jobParams, never from this anchor's ids (plan's
 *  own closing note: "pass explicit targets in tool args"). The last Card on the
 *  Page (or the first selected Card, for scope: cards) is a reasonable real anchor;
 *  an empty Page has no real Card to use at all, so this falls back to a synthetic,
 *  never-persisted one — safe for both of the only two things an anchor's own ids
 *  are ever used for: a job's own `pageId ?? pageCard.pageId` fallback (still
 *  correct — pageId is real) and a closing `notifySaved(pageCard.card.id)` (a no-op
 *  for an id nothing subscribes to, cardStore.ts). */
function resolveAnchorPageCard(page: PageWithCards, selectedCards?: PageCardWithCard[]): PageCardWithCard {
  const real = selectedCards?.[0] ?? page.pageCards[page.pageCards.length - 1];
  if (real) return real;
  const now = new Date().toISOString();
  return {
    id: "agent-anchor",
    pageId: page.id,
    cardId: "agent-anchor",
    order: 0,
    draftTitle: null,
    draftContent: null,
    createdAt: now,
    updatedAt: now,
    card: {
      id: "agent-anchor",
      title: "",
      content: "",
      metadata: defaultMetadata(),
      savedToVault: false,
      frozenAt: null,
      forkedFromId: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function textOf(content: MessageContent[]): string {
  return content
    .filter((b): b is Extract<MessageContent, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function toolUsesOf(content: MessageContent[]): Extract<MessageContent, { type: "tool_use" }>[] {
  return content.filter((b): b is Extract<MessageContent, { type: "tool_use" }> => b.type === "tool_use");
}

/**
 * The agent loop itself (Brilliantly Simple Generation Agent plan, Phase 4) — calls
 * POST /api/agent/turn (one model call, native tool-calling, no loop server-side),
 * runs whatever tool_use blocks come back through the existing action-job runner
 * (runActionJob, via the caller's own onRunActionJob), feeds the results back as the
 * next turn's tool_result messages, and repeats until the model stops asking for
 * tools (or a Cap/abort/input-card pause ends it early). Replaces the old AUTORUN
 * action-card chain — no action-script vocabulary is taught here at all; the model
 * only ever sees real, native tools.
 */
export function useAgentLoop(): UseAgentLoopResult {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAgent = useCallback(async (input: RunAgentInput): Promise<AgentRunOutcome> => {
    const { scope, instruction, page, selectedCards, onRunActionJob, onProgress, signal } = input;
    setRunning(true);
    setError(null);
    try {
      const contextText =
        scope === "cards" && selectedCards
          ? await buildCardsContextText(page, selectedCards)
          : await buildPageContextText(page);
      const tools = buildAgentToolDefinitions(scope);
      const pageCards = buildPageCardLookup(page);
      const anchor = resolveAnchorPageCard(page, selectedCards);

      let messages: AgentMessage[] = [];
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (signal.aborted) return { status: "aborted" };

        const turn = await api.agentTurn({ scope, instruction, contextText, messages, tools });
        messages = [...messages, { role: "assistant", content: turn.content }];

        const toolUses = toolUsesOf(turn.content);
        onProgress?.({ text: textOf(turn.content) || undefined, toolNames: toolUses.map((tu) => tu.name) });

        if (turn.stopReason !== "tool_use" || toolUses.length === 0) {
          return { status: "done", text: textOf(turn.content) };
        }

        let pausedForInput = false;
        const results: Extract<MessageContent, { type: "tool_result" }>[] = [];
        for (const call of toolUses) {
          if (signal.aborted) return { status: "aborted" };
          try {
            const jobParams = toolInputToJobParams(call.name, call.input, pageCards);
            const out = await onRunActionJob(anchor, call.name, jobParams);
            // The one enrichment the plan calls for (Phase 2's own note): a created
            // card's title, straight off the same tool call's own input — the model
            // already knows it, so this just saves it from having to remember which
            // pageCardId/cardId went with which title a few rounds later, without a
            // separate fetch. Context itself isn't rebuilt mid-run (this is the whole
            // mechanism for the agent to learn about anything it just created).
            const payload = out
              ? { ...out, title: typeof call.input.title === "string" ? call.input.title : undefined }
              : { ok: true };
            results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(payload) });
            if (call.name === "createCard" && call.input.typeId === "input") pausedForInput = true;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            results.push({ type: "tool_result", tool_use_id: call.id, content: message, is_error: true });
          }
        }

        if (pausedForInput) return { status: "paused_for_input" };
        messages = [...messages, { role: "user", content: results }];
      }
      return { status: "max_rounds" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Agent run failed";
      setError(message);
      throw err;
    } finally {
      setRunning(false);
    }
  }, []);

  return { running, error, runAgent };
}
