import { useCallback, useEffect, useRef, useState } from "react";
import type { GeneratedCardPart, GenerateResponse } from "@wattle/shared";
import * as api from "../api/client.js";
import { t } from "../i18n/index.js";

/** One piece of a ghost card's content, in the order it streamed in: either literal
 *  text, or a reference to a nested ghost card (rendered as an embedded sub-card —
 *  see GhostCard.tsx). Mirrors @wattle/prompt-engine's CardBlockParser events, kept
 *  structurally duplicated here (not imported) since this is a browser bundle and
 *  that package is API/Node-only. */
export type GhostCardPart = { kind: "text"; text: string } | { kind: "child"; id: number };

export interface GhostCardNode {
  id: number;
  parentId: number | null;
  cardType: string;
  title: string;
  parts: GhostCardPart[];
  closed: boolean;
}

/** Where the in-flight generation is anchored — a specific Card (insert directly
 *  below it), a Page with nothing selected (append at the bottom), or a blank Stack
 *  alternate (fills its own content in place — see StackBody.tsx). Mirrors
 *  @wattle/api's GenerationTarget. Tracked here so finalizing knows which endpoint/
 *  payload shape to use without the caller having to remember and re-pass it. */
export type GenerationTarget =
  | { type: "card"; pageCardId: string }
  | { type: "page"; pageId: string }
  | { type: "stackMember"; memberId: string };

interface CardBlockStreamEvent {
  type: "open" | "text" | "close" | "done" | "error";
  id?: number;
  parentId?: number | null;
  cardType?: string;
  title?: string;
  text?: string;
  message?: string;
  /** Only set on "done" — true when the model's response was cut off (almost always
   *  maxTokens) and the parser recovered by auto-closing whatever was still open
   *  (@wattle/prompt-engine's CardBlockParser.finish()) rather than discarding the
   *  whole generation. */
  truncated?: boolean;
}

export interface UseGenerationResult {
  /** True from the moment a generation starts until it's fully settled — covers both
   *  the SSE streaming phase and the brief save that follows it. There is no review
   *  step any more: a generation that completes (or is stopped) is saved immediately
   *  as a real Card, no separate Accept/Deny action required. */
  isStreaming: boolean;
  /** A one-time message set right after a generation lands, if it wasn't a clean
   *  finish — cut off by the model's token limit, or ended early via `stop()`. Null
   *  for an ordinary completion. Cleared on the next start()/dismissNotice(). */
  notice: string | null;
  dismissNotice: () => void;
  /** Set when the stream itself fails (bad credentials, network failure, no root
   *  card ever opened — see cardBlockParser.ts) rather than landing a Card at all.
   *  Deliberately does *not* clear the ghost-card state on its own — the partial
   *  ghost stays visible for inspection until dismissError() is called. */
  error: string | null;
  dismissError: () => void;
  nodes: Record<number, GhostCardNode>;
  rootId: number | null;
  /** Where the current/last generation is anchored (see GenerationTarget) — null when
   *  nothing has been started yet. Lets callers (PageStack's ghost-card slot) know
   *  whether to render it after a specific PageCard or at the bottom of the Page. */
  target: GenerationTarget | null;
  /** Opens the SSE stream for a selected Card — the sole model call for this
   *  generation. Builds up the ghost card tree in local state as it streams in, and
   *  saves it automatically the moment the stream ends cleanly. `instruction`, if
   *  given, is the Feed Input Button's typed guide text (Step 6 spec §2.2) or a
   *  Prompt Card's configured instructions (lib/actionJobs.ts). `standalone`, only
   *  ever set by a Prompt Card's "on its own" mode, skips the Generation Rule
   *  context entirely. `actionsDoc`, whenever `instruction` is also given, is the
   *  runnable-action vocabulary (lib/actionScriptPrompt.ts's
   *  buildActionScriptActionsDoc) — lets this "interactive"-mode turn's model
   *  respond with a self-running "action" card (see App.tsx's onGenerationAccepted,
   *  the "guide the next generation" auto-run pipeline). */
  start: (pageCardId: string, instruction?: string, standalone?: boolean, actionsDoc?: string) => void;
  /** Same as `start`, but for the "nothing selected" case — generates at the bottom
   *  of a Page instead of directly below a specific Card. */
  startForPage: (pageId: string, instruction?: string, actionsDoc?: string) => void;
  /** Same as `start`, but for a blank Stack alternate (StackBody.tsx) — fills that
   *  alternate's own content in place instead of inserting a sibling PageCard. */
  startForStackMember: (memberId: string, instruction?: string, actionsDoc?: string) => void;
  /** Ends the stream early and immediately saves whatever's been generated so far as
   *  the real Card — the same save path a clean completion uses, just triggered by
   *  the user instead of the model finishing on its own. If nothing has streamed in
   *  yet (no root card opened), this just cancels — there's nothing to save. */
  stop: () => void;
}

/** Converts a ghost node's parts into the structured payload persistGeneratedCard(ToPage)
 *  expects, recursively — the exact text/nesting the model streamed, minus nothing. */
function buildParts(id: number, nodes: Record<number, GhostCardNode>): GeneratedCardPart[] {
  const node = nodes[id];
  if (!node) return [];
  return node.parts.map((part): GeneratedCardPart => {
    if (part.kind === "text") return { kind: "text", text: part.text };
    const child = nodes[part.id];
    return {
      kind: "child",
      cardType: child?.cardType ?? "note",
      title: child?.title ?? "",
      parts: child ? buildParts(child.id, nodes) : [],
    };
  });
}

/**
 * Consumes the streaming generation endpoints (GET /api/generate/stream/:pageCardId,
 * or /stream/page/:pageId for the "nothing selected" case) via EventSource. Those
 * endpoints are the sole model invocation for a generation — there is no separate
 * preview call any more — and they forward CardBlockParser events instead of raw text
 * chunks, so this hook builds up a small local tree (root ghost card + any nested
 * ghost cards) as those events arrive, rather than just accumulating a string. Once
 * the stream ends (cleanly or via `stop()`), that tree is saved immediately — no
 * separate Accept/Deny review step.
 *
 * `onAccepted` runs after every successful save (App.tsx passes onGenerationAccepted —
 * the ghost card's local state is only cleared *after* this resolves, so the
 * freshly-saved real Card is already in `pages` before the ghost slot disappears,
 * avoiding a flash of nothing in between). Receives the full GenerateResponse for the
 * "card"/"page" targets (everything App.tsx's auto-run pipeline needs to inspect
 * whether the just-saved Card is a self-running "action" one); omitted for the
 * "stackMember" target, which saves a StackMember instead — not something the auto-run
 * pipeline applies to (a Stack alternate isn't reachable from the "guide the next
 * generation" Circle this pipeline is scoped to).
 */
export function useGeneration(
  onAccepted?: (result?: GenerateResponse) => void | Promise<void>,
): UseGenerationResult {
  const [isStreaming, setIsStreaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Record<number, GhostCardNode>>({});
  const [rootId, setRootId] = useState<number | null>(null);
  const [target, setTarget] = useState<GenerationTarget | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => sourceRef.current?.close(), []);

  const reset = useCallback(() => {
    setNodes({});
    setRootId(null);
    setTarget(null);
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
    reset();
  }, [reset]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const openStream = useCallback(
    (streamTarget: GenerationTarget, url: string) => {
      sourceRef.current?.close();
      reset();
      setError(null);
      setNotice(null);
      setTarget(streamTarget);
      setIsStreaming(true);

      // Local mirrors of the React state above, updated in lockstep with every
      // setNodes/setRootId call below. Needed because finalize() (and the "done"
      // handler that calls it) live inside this same closure, created once per
      // openStream() call — they'd otherwise see whatever `nodes`/`rootId` were at
      // mount time (empty/null), not the live values, since this isn't a
      // useCallback that gets recreated with fresh deps on every state update.
      let localNodes: Record<number, GhostCardNode> = {};
      let localRootId: number | null = null;
      let finalized = false;

      const source = new EventSource(url);
      sourceRef.current = source;

      /** The single save path — used both when the stream ends cleanly ("done") and
       *  when the user hits Stop mid-stream. Guarded against running twice (e.g. Stop
       *  clicked right as "done" arrives). */
      async function finalize(reason: "completed" | "truncated" | "stopped") {
        if (finalized) {
          console.debug(`[gen] finalize(${reason}) skipped — already finalized`);
          return;
        }
        finalized = true;
        console.debug(`[gen] finalize(${reason})`, { rootId: localRootId, target: streamTarget });

        const root = localRootId !== null ? localNodes[localRootId] : undefined;
        if (!root) {
          console.debug(`[gen] finalize(${reason}): nothing generated yet, nothing to save`);
          setIsStreaming(false);
          reset();
          return;
        }

        const generated = { title: root.title, cardType: root.cardType, parts: buildParts(root.id, localNodes) };
        try {
          const saved = await api.acceptGeneration(
            streamTarget.type === "card"
              ? { pageCardId: streamTarget.pageCardId }
              : streamTarget.type === "stackMember"
                ? { memberId: streamTarget.memberId }
                : { pageId: streamTarget.pageId },
            generated,
          );
          console.debug(`[gen] finalize(${reason}) saved successfully`);
          if (reason === "truncated") setNotice(t("generate.truncatedNotice"));
          else if (reason === "stopped") setNotice(t("generate.stoppedNotice"));
          await onAccepted?.(streamTarget.type === "stackMember" ? undefined : (saved as GenerateResponse));
        } catch (err) {
          console.debug(`[gen] finalize(${reason}) FAILED to save:`, err);
          setError(err instanceof Error ? err.message : "Failed to save the generated card");
        } finally {
          setIsStreaming(false);
          reset();
        }
      }

      stopRef.current = () => {
        console.debug("[gen] stop() called by user");
        source.close();
        void finalize("stopped");
      };

      source.onmessage = (evt) => {
        let event: CardBlockStreamEvent;
        try {
          event = JSON.parse(evt.data) as CardBlockStreamEvent;
        } catch {
          console.debug("[gen] failed to parse SSE payload:", evt.data);
          source.close();
          setIsStreaming(false);
          setError("Failed to parse stream event");
          return;
        }
        console.debug("[gen] SSE event:", event);

        switch (event.type) {
          case "open": {
            const id = event.id!;
            const parentId = event.parentId ?? null;
            const node: GhostCardNode = {
              id,
              parentId,
              cardType: event.cardType ?? "note",
              title: event.title ?? "",
              parts: [],
              closed: false,
            };
            localNodes = { ...localNodes, [id]: node };
            if (parentId !== null && localNodes[parentId]) {
              localNodes = {
                ...localNodes,
                [parentId]: {
                  ...localNodes[parentId],
                  parts: [...localNodes[parentId].parts, { kind: "child", id }],
                },
              };
            }
            if (parentId === null) localRootId = id;
            setNodes(localNodes);
            if (parentId === null) setRootId(id);
            break;
          }
          case "text": {
            const id = event.id!;
            const text = event.text ?? "";
            const node = localNodes[id];
            if (node) {
              const last = node.parts[node.parts.length - 1];
              const parts =
                last && last.kind === "text"
                  ? [...node.parts.slice(0, -1), { kind: "text" as const, text: last.text + text }]
                  : [...node.parts, { kind: "text" as const, text }];
              localNodes = { ...localNodes, [id]: { ...node, parts } };
              setNodes(localNodes);
            }
            break;
          }
          case "close": {
            const id = event.id!;
            if (localNodes[id]) {
              localNodes = { ...localNodes, [id]: { ...localNodes[id], closed: true } };
              setNodes(localNodes);
            }
            break;
          }
          case "done":
            source.close();
            void finalize(event.truncated ? "truncated" : "completed");
            break;
          case "error":
            console.debug("[gen] generation FAILED:", event.message);
            source.close();
            setIsStreaming(false);
            setError(event.message ?? "Generation failed");
            break;
        }
      };

      source.onerror = (err) => {
        console.debug("[gen] EventSource transport error:", err);
        source.close();
        setIsStreaming(false);
        setError((prev) => prev ?? "Streaming connection failed");
      };
    },
    [reset, onAccepted],
  );

  const start = useCallback(
    (pageCardId: string, instruction?: string, standalone?: boolean, actionsDoc?: string) => {
      const params = new URLSearchParams();
      if (instruction) params.set("instruction", instruction);
      if (standalone) params.set("standalone", "1");
      if (instruction && actionsDoc) params.set("actionsDoc", actionsDoc);
      const query = params.toString();
      openStream({ type: "card", pageCardId }, `/api/generate/stream/${pageCardId}${query ? `?${query}` : ""}`);
    },
    [openStream],
  );

  const startForPage = useCallback(
    (pageId: string, instruction?: string, actionsDoc?: string) => {
      const params = new URLSearchParams();
      if (instruction) params.set("instruction", instruction);
      if (instruction && actionsDoc) params.set("actionsDoc", actionsDoc);
      const query = params.toString();
      openStream({ type: "page", pageId }, `/api/generate/stream/page/${pageId}${query ? `?${query}` : ""}`);
    },
    [openStream],
  );

  /** A blank Stack alternate's own Feed Input Button (StackBody.tsx) — fills that
   *  alternate's content in place rather than inserting a sibling PageCard. */
  const startForStackMember = useCallback(
    (memberId: string, instruction?: string, actionsDoc?: string) => {
      const params = new URLSearchParams();
      if (instruction) params.set("instruction", instruction);
      if (instruction && actionsDoc) params.set("actionsDoc", actionsDoc);
      const query = params.toString();
      openStream(
        { type: "stackMember", memberId },
        `/api/generate/stream/stack-member/${memberId}${query ? `?${query}` : ""}`,
      );
    },
    [openStream],
  );

  const stop = useCallback(() => {
    stopRef.current?.();
  }, []);

  return {
    isStreaming,
    notice,
    dismissNotice,
    error,
    dismissError,
    nodes,
    rootId,
    target,
    start,
    startForPage,
    startForStackMember,
    stop,
  };
}
