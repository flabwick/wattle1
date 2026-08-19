import type { Card, PageCardWithCard } from "@wattle/shared";
import { flattenToPlainText, htmlToDoc } from "@wattle/shared";
import * as api from "../api/client.js";
import { getCardTypeId } from "./getCardTypeId.js";
import type { StepOutput } from "./actionJobRegistry.js";

/** The plain, JSON-serializable shape a `js`-typed Card's sandbox actually sees for a
 *  Card — never the real `Card` object (a live TipTap doc, internal metadata
 *  shapes the script has no business depending on): just what DataviewJS-style
 *  scripts actually query on. `pageCardId` is only present for a Card that's
 *  actually placed on the current Page (wattle.page.cards()/page.card()) — a
 *  Card reached via wattle.card(id)/vault.search has none, since it may not be
 *  on any Page at all. */
export interface WattleCardSummary {
  id: string;
  pageCardId?: string;
  typeId: string;
  title: string;
  content: string;
  text: string;
  tags: string[];
  properties: { key: string; value: string }[];
  inputValue?: string[];
}

function plainText(html: string): string {
  return flattenToPlainText(htmlToDoc(html)).text.trim();
}

function describeCard(card: Card, pageCardId?: string): WattleCardSummary {
  return {
    id: card.id,
    pageCardId,
    typeId: getCardTypeId(card),
    title: card.title,
    content: card.content,
    text: plainText(card.content),
    tags: card.metadata.tags ?? [],
    properties: (card.metadata.properties ?? []).map((p) => ({ key: p.key, value: p.value })),
    inputValue: card.metadata.input?.value,
  };
}

/** Everything the RPC handler below needs about a `js`-typed Card's own
 *  surroundings — built once per JsCardView render straight from
 *  CardTypeViewProps/CardTypeEditorProps (the same props every other CardType's
 *  View/Editor already gets), not a separate context: a `js` Card is a
 *  standalone top-level CardType now, not a block embedded in some other
 *  Card's own content, so there's no "nested, no Page of its own" case to
 *  handle the way an inline actionButton node still has to. */
export interface WattleSdkHostContext {
  pageCard: PageCardWithCard;
  pageSiblings?: PageCardWithCard[];
  onRunActionJob: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => void;
}

async function runJob(
  ctx: WattleSdkHostContext,
  jobId: string,
  jobParams: Record<string, unknown>,
): Promise<StepOutput | void> {
  return Promise.resolve(ctx.onRunActionJob(ctx.pageCard, jobId, jobParams)) as Promise<StepOutput | void>;
}

/**
 * Dispatches one `wattle.*` RPC call (wattleSandboxBootstrap.ts's own `rpc()`,
 * relayed by JsCardView.tsx's message listener) to a real API call or existing
 * action job. This is the ONLY place a sandboxed script's request actually
 * touches the app — every read goes through the same `api.*` client every
 * other feature uses, and every mutation goes through `actionJobRegistry.ts`'s
 * existing jobs via `onRunActionJob` (App.tsx's `handleRunActionJob`), never a
 * bespoke write path of its own. The sandbox's own `requireHandler` already
 * refuses to send a mutating call from top-level script in the first place.
 */
export async function handleWattleRpcCall(
  ctx: WattleSdkHostContext,
  method: string,
  args: unknown[],
): Promise<unknown> {
  switch (method) {
    case "this": {
      return {
        cardId: ctx.pageCard.card.id,
        pageId: ctx.pageCard.pageId,
        pageCardId: ctx.pageCard.id,
      };
    }

    case "page.cards": {
      return (ctx.pageSiblings ?? []).map((pc) => describeCard(pc.card, pc.id));
    }

    case "page.card": {
      const id = String(args[0] ?? "");
      const fromPage = ctx.pageSiblings?.find((pc) => pc.card.id === id);
      if (fromPage) return describeCard(fromPage.card, fromPage.id);
      const card = await api.getCard(id);
      return describeCard(card);
    }

    case "card": {
      const id = String(args[0] ?? "");
      const card = await api.getCard(id);
      return describeCard(card);
    }

    case "vault.search": {
      const query = typeof args[0] === "string" ? args[0] : "";
      const [cards, pages] = await Promise.all([api.listCards(query || undefined), api.searchPages(query || undefined)]);
      return {
        cards: cards.map((c) => describeCard(c)),
        pages: pages.map((p) => ({ id: p.id, title: p.title, preview: p.preview })),
      };
    }

    case "search": {
      const query = typeof args[0] === "string" ? args[0] : "";
      const opts = (args[1] as { mode?: "vault" | "web" } | undefined) ?? {};
      if (opts.mode === "web") {
        const res = await api.searchWeb(query);
        return { mode: "web", configured: res.configured, results: res.results };
      }
      const [cards, pages] = await Promise.all([api.listCards(query || undefined), api.searchPages(query || undefined)]);
      return {
        mode: "vault",
        cards: cards.map((c) => describeCard(c)),
        pages: pages.map((p) => ({ id: p.id, title: p.title, preview: p.preview })),
      };
    }

    case "createCard": {
      const input = (args[0] as { title?: string; content?: string; typeId?: string; pageId?: string }) ?? {};
      const result = await runJob(ctx, "createCard", {
        title: input.title ?? "",
        content: input.content ?? "",
        typeId: input.typeId,
        page: input.pageId,
      });
      return result ?? null;
    }

    case "editCard": {
      const id = String(args[0] ?? "");
      const patch = (args[1] as { title?: string; content?: string }) ?? {};
      await runJob(ctx, "editCard", { target: id, title: patch.title, content: patch.content });
      return { ok: true };
    }

    case "removeCard": {
      const pageCardId = String(args[0] ?? "");
      await runJob(ctx, "removeCard", { target: pageCardId });
      return { ok: true };
    }

    case "generate": {
      const instructions = String(args[0] ?? "");
      const opts = (args[1] as { context?: "page" | "own"; present?: "card" | "here" } | undefined) ?? {};
      const contextMode = opts.context === "own" ? "own" : "context";
      const result = await runJob(ctx, "promptCard", { instructions, contextMode });
      if (!result) return null;
      if (opts.present === "here") {
        // No headless/non-card-creating completion path exists yet — this runs
        // the normal (card-creating, streamed) flow, reads the finished Card's
        // own content back out, then removes the now-redundant intermediate
        // Card, handing the script back plain HTML to draw itself (wattle.ui.html)
        // rather than the block streaming token-by-token — a documented
        // simplification, not literal live streaming into the iframe.
        const generated = await api.getCard(result.cardId);
        await api.deletePageCardEntirely(result.pageCardId);
        return { html: generated.content, title: generated.title };
      }
      return { cardId: result.cardId, pageCardId: result.pageCardId };
    }

    case "navigate.toPage": {
      // Always a title (find-or-create), same convention every other
      // Page-by-name reference in the app already uses (actionScript.ts's own
      // pagePicker field) — there's no stable way to spell an arbitrary
      // pre-existing Page by id from script text/a model's own output.
      const title = String(args[0] ?? "");
      const page = await api.resolvePageByTitle(title);
      await runJob(ctx, "navigateToPage", { page: page.id });
      return { pageId: page.id };
    }

    default:
      throw new Error(`Unknown wattle call: "${method}"`);
  }
}
