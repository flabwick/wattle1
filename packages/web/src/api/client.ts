import type {
  Card,
  CreateCardInput,
  CreateTemplateInput,
  DockCardWithCard,
  GeneratedCardPart,
  GenerateResponse,
  NearbyItem,
  OpenTemplateInput,
  OpenTemplateResult,
  Page,
  PageCard,
  PageCardWithCard,
  PageSummary,
  PageWithCards,
  StackData,
  StackMember,
  StackMemberWithCard,
  Template,
  TemplateWithSnapshot,
  UpdateCardInput,
  UpdateTemplateSnapshotInput,
  UserSettings,
  WebExtractResponse,
  WebSearchResponse,
} from "@wattle/shared";

/** The three annotation processes — see useAnnotations.ts and
 *  @wattle/prompt-engine's annotationCompiler.ts (same set, duplicated here for the
 *  same reason every other shared-shape type in this file is: the web client only
 *  depends on @wattle/shared, not @wattle/prompt-engine). */
export type AnnotationProcess = "diff" | "footnote" | "highlight";

/**
 * Thin fetch wrapper around the API. This is the *only* place the web client talks
 * HTTP — every other module deals in shared types (spec1.md Part 4 "Separate the
 * Brain from the Face": no business logic lives in the frontend).
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // TEMP DEBUG — remove once the annotation-run-doesn't-do-anything issue is
  // diagnosed. Logs every request/response this client makes, not just
  // annotations, since it's the one choke point every API call passes through.
  console.debug(`[api] -> ${init?.method ?? "GET"} /api${path}`, init?.body ? JSON.parse(init.body as string) : undefined);
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  console.debug(`[api] <- ${init?.method ?? "GET"} /api${path}`, res.status, res.ok ? "ok" : "FAILED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.debug(`[api] error body for ${path}:`, body);
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Templates — reusable Tab/Page templates. Snapshots are always built server-side
// from a real Tab/Page reference; this client only ever sends ids.
export const listTemplates = () => request<Template[]>("/templates");
export const getTemplate = (id: string) => request<TemplateWithSnapshot>(`/templates/${id}`);
export const createTemplate = (input: CreateTemplateInput) =>
  request<TemplateWithSnapshot>("/templates", { method: "POST", body: JSON.stringify(input) });
export const updateTemplateSnapshot = (id: string, input: UpdateTemplateSnapshotInput) =>
  request<TemplateWithSnapshot>(`/templates/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteTemplate = (id: string) => request<void>(`/templates/${id}`, { method: "DELETE" });
export const openTemplate = (id: string, input: OpenTemplateInput = {}) =>
  request<OpenTemplateResult>(`/templates/${id}/open`, { method: "POST", body: JSON.stringify(input) });

// Search — the "search" CardType's web mode (registries/definitions/
// searchCardType.ts). Vault mode reuses listCards/searchPages directly below.
export const searchWeb = (q: string) =>
  request<WebSearchResponse>(`/search/web?q=${encodeURIComponent(q)}`);
/** The "export selected results as a Card" action (SearchCardBody.tsx) — full page
 *  text for up to 20 URLs at once. */
export const extractWebPages = (urls: string[]) =>
  request<WebExtractResponse>("/search/web/extract", { method: "POST", body: JSON.stringify({ urls }) });

/** The "action" CardType's own "Generate steps with AI" feature
 *  (lib/actionScript.ts/actionScriptPrompt.ts) — one blocking model call, no
 *  streaming. `actionsDoc` is rendered client-side from the action-job registry
 *  (lib/actionScriptPrompt.ts's buildActionScriptActionsDoc); the server splices it
 *  into the static prompt template it reads from disk
 *  (packages/prompt-engine/prompts/action-script/system.md). `currentScript`,
 *  when regenerating an existing button, is that button's own script serialized
 *  back to text (lib/actionScript.ts's serializeActionScript) so the model edits
 *  in context. */
export const generateActionScript = (actionsDoc: string, instruction: string, currentScript?: string) =>
  request<{ text: string }>("/action-scripts/generate", {
    method: "POST",
    body: JSON.stringify({ actionsDoc, instruction, currentScript }),
  });

// Vault
export const listCards = (q?: string) =>
  request<Card[]>(`/cards${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getCard = (id: string) => request<Card>(`/cards/${id}`);
export const createCard = (input: CreateCardInput) =>
  request<Card>("/cards", { method: "POST", body: JSON.stringify(input) });
export const updateCard = (id: string, input: UpdateCardInput) =>
  request<Card>(`/cards/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteCard = (id: string) => request<void>(`/cards/${id}`, { method: "DELETE" });
/** Direct URL (not routed through `request()`) for a "file"-typed Card's uploaded
 *  bytes — used as an <iframe>/<img> src or fetched as raw text, never as JSON. */
export const getCardFileUrl = (id: string) => `/api/cards/${id}/file`;
/** The Vault panel's own Upload action — a real, already-savedToVault "file"-typed
 *  Card. Same multipart/bypass-request() shape as uploadFileToPage. */
export const uploadFileToVault = async (file: File): Promise<Card> => {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/cards/files`, { method: "POST", body });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<Card>;
};

// Settings — Home (Pages + Links + Search rebuild, Phase 4).
export const getSettings = () => request<UserSettings>("/settings");
export const setHomePage = (pageId: string | null) =>
  request<UserSettings>("/settings/home", { method: "PUT", body: JSON.stringify({ pageId }) });

// Pages — a Page is a destination in its own right now, not scoped to a Tab.
/** Search/list Pages by title (Search's Page results, and the Pages panel's own
 *  quick-jump list) — omit `q` for the default "claimed" listing (named, pinned, or
 *  linked from somewhere). */
export const searchPages = (q?: string) =>
  request<PageSummary[]>(`/pages${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const listPinnedPages = () => request<PageSummary[]>("/pages/pinned");
/** Find-or-create a Page by title — the Page-link picker's "link to missing title →
 *  create empty Page, link to it". */
export const resolvePageByTitle = (title: string) =>
  request<Page>("/pages/resolve", { method: "POST", body: JSON.stringify({ title }) });
export const getPage = (id: string) => request<PageWithCards>(`/pages/${id}`);
export const listSiblingPages = (id: string) => request<PageSummary[]>(`/pages/${id}/siblings`);
export const createPage = (title?: string) =>
  request<Page>("/pages", { method: "POST", body: JSON.stringify(title ? { title } : {}) });
export const renamePage = (id: string, title: string) =>
  request<Page>(`/pages/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
export const setPagePinned = (id: string, pinnedOrder: number | null) =>
  request<Page>(`/pages/${id}/pin`, { method: "PUT", body: JSON.stringify({ pinnedOrder }) });
export const deletePage = (id: string) => request<void>(`/pages/${id}`, { method: "DELETE" });
export const reorderSiblingPages = (orderedIds: string[]) =>
  request<void>("/pages/reorder-siblings", { method: "PUT", body: JSON.stringify({ orderedIds }) });

// Page <-> Card membership
export const addExistingCardToPage = (pageId: string, cardId: string) =>
  request<PageCard>(`/pages/${pageId}/cards`, { method: "POST", body: JSON.stringify({ cardId }) });
export const addNewCardToPage = (pageId: string, title: string, content: string, metadata?: unknown) =>
  request<PageCardWithCard>(`/pages/${pageId}/cards`, {
    method: "POST",
    body: JSON.stringify(metadata !== undefined ? { title, content, metadata } : { title, content }),
  });
/** Multipart, unlike every other call here — bypasses `request()` so the browser sets
 *  its own `Content-Type: multipart/form-data; boundary=...` instead of the JSON one
 *  `request()` always adds. */
export const uploadFileToPage = async (pageId: string, file: File): Promise<PageCardWithCard> => {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/pages/${pageId}/files`, { method: "POST", body });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<PageCardWithCard>;
};
export const reorderPageCards = (pageId: string, orderedIds: string[]) =>
  request<void>(`/pages/${pageId}/cards/reorder`, {
    method: "PUT",
    body: JSON.stringify({ orderedIds }),
  });

/** The rich-text editor's "insert image" toolbar action (Dock.tsx) — uploads bytes
 *  and gets back a plain URL, unlike uploadFileToPage above: no Card is created,
 *  this backs a TipTap `image` node embedded inline in whatever Card is being
 *  edited, not a new sibling Card. Same multipart/bypass-request() shape as
 *  uploadFileToPage. */
export const uploadRichTextImage = async (file: File): Promise<{ url: string }> => {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/rich-text-images", { method: "POST", body });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<{ url: string }>;
};

// Dock actions on a single PageCard
export const updatePageCardDraft = (
  pageCardId: string,
  draft: { title?: string; content?: string },
) => request<PageCard>(`/page-cards/${pageCardId}`, { method: "PATCH", body: JSON.stringify(draft) });
export const savePageCardToVault = (pageCardId: string) =>
  request<PageCard>(`/page-cards/${pageCardId}/save`, { method: "POST" });
export const removePageCardFromPage = (pageCardId: string) =>
  request<void>(`/page-cards/${pageCardId}`, { method: "DELETE" });
export const deletePageCardEntirely = (pageCardId: string) =>
  request<void>(`/page-cards/${pageCardId}/vault`, { method: "DELETE" });
export const movePageCard = (pageCardId: string, destPageId: string, destIndex: number) =>
  request<void>(`/page-cards/${pageCardId}/move`, {
    method: "PUT",
    body: JSON.stringify({ destPageId, destIndex }),
  });
/** Moves a selected Card off its Page and onto the Dock's persistent scratchpad
 *  (Step 6 spec §4.2). */
export const movePageCardToDock = (pageCardId: string) =>
  request<DockCardWithCard>(`/page-cards/${pageCardId}/move-to-dock`, { method: "PUT" });
/** Freezes a vault Card — read-only from here on (Open/Frozen). */
export const freezeCard = (cardId: string) => request<Card>(`/cards/${cardId}/freeze`, { method: "POST" });
/** Forks the Frozen Card a PageCard/DockCard occurrence points at and repoints that
 *  one occurrence at the fork — App.tsx's activatePageCardEditor calls this before
 *  marking a Frozen Card as the Dock's formatting-toolbar target. */
export const forkPageCardOccurrence = (pageCardId: string) =>
  request<PageCard>(`/page-cards/${pageCardId}/fork`, { method: "POST" });
export const forkDockCardOccurrence = (dockCardId: string) =>
  request<DockCardWithCard>(`/dock-cards/${dockCardId}/fork`, { method: "POST" });

// Nearby — durable proximity + live re-rank (Wattle vault plan).
export const getDurableNearby = (cardId: string, limit = 8) =>
  request<NearbyItem[]>(`/nearby/durable/${cardId}?limit=${limit}`);
export const getLiveNearby = (input: { pageId: string; focusedCardId?: string; draftText?: string; limit?: number }) =>
  request<NearbyItem[]>("/nearby/live", { method: "POST", body: JSON.stringify(input) });

// Stacks — see registries/definitions/stackCardType.ts, stackService.ts, useCardStack.ts.
export const createStack = (pageId: string) =>
  request<PageCardWithCard>("/stacks", { method: "POST", body: JSON.stringify({ pageId }) });
export const convertCardToStack = (pageCardId: string) =>
  request<PageCardWithCard>("/stacks/convert", { method: "POST", body: JSON.stringify({ pageCardId }) });
export const getStack = (stackCardId: string) => request<StackData>(`/stacks/${stackCardId}`);
export const setStackActiveIndex = (stackCardId: string, index: number) =>
  request<{ activeIndex: number }>(`/stacks/${stackCardId}/active`, {
    method: "PUT",
    body: JSON.stringify({ index }),
  });
export const closeStack = (stackCardId: string) =>
  request<void>(`/stacks/${stackCardId}/close`, { method: "DELETE" });
export const deleteStack = (stackCardId: string) =>
  request<void>(`/stacks/${stackCardId}`, { method: "DELETE" });
export const addStackMember = (stackCardId: string) =>
  request<StackMemberWithCard>(`/stacks/${stackCardId}/members`, { method: "POST" });
export const updateStackMemberDraft = (
  memberId: string,
  draft: { title?: string; content?: string },
) => request<StackMember>(`/stacks/members/${memberId}`, { method: "PATCH", body: JSON.stringify(draft) });
export const saveStackMemberToVault = (memberId: string) =>
  request<StackMember>(`/stacks/members/${memberId}/save`, { method: "POST" });
export const removeStackMember = (memberId: string) =>
  request<{ stackDeleted: boolean }>(`/stacks/members/${memberId}`, { method: "DELETE" });

// Dock Cards — the persistent scratchpad layer outside every Page/Tab (Step 6 spec §1.2).
export const listDockCards = () => request<DockCardWithCard[]>("/dock-cards");
export const addExistingCardToDock = (cardId: string) =>
  request<DockCardWithCard>("/dock-cards", { method: "POST", body: JSON.stringify({ cardId }) });
export const createCardInDock = (title: string, content: string) =>
  request<DockCardWithCard>("/dock-cards", {
    method: "POST",
    body: JSON.stringify({ title, content }),
  });
export const uploadFileToDock = async (file: File): Promise<DockCardWithCard> => {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/dock-cards/files`, { method: "POST", body });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<DockCardWithCard>;
};
export const removeDockCard = (id: string) => request<void>(`/dock-cards/${id}`, { method: "DELETE" });
export const moveDockCardToPage = (dockCardId: string, pageId: string, destIndex: number) =>
  request<PageCard>(`/dock-cards/${dockCardId}/move-to-page`, {
    method: "PUT",
    body: JSON.stringify({ pageId, destIndex }),
  });

// Generation Rule — the streaming calls themselves (GET /generate/stream/:pageCardId,
// /stream/page/:pageId for the "nothing selected" case, or /stream/stack-member/:memberId
// for a blank Stack alternate) go through useGeneration.ts's EventSource, not this REST
// client. This is only the accept step: persisting a ghost card the user reviewed after
// that stream finished. No model call happens here.
export const acceptGeneration = (
  target: { pageCardId: string } | { pageId: string } | { memberId: string },
  generated: { title: string; cardType?: string; parts: GeneratedCardPart[] },
) =>
  request<GenerateResponse | StackMember>("/generate/accept", {
    method: "POST",
    body: JSON.stringify({ ...target, ...generated }),
  });

// Annotation processes (diff/footnote/highlight) — a separate, parallel pipeline from
// generation above: these never create new Cards, only sparse overlays on existing
// content (see Card.metadata.annotations, packages/shared/src/registries/cardMetadata.ts).
// `pageCardId`, whenever the target Card is currently open on a Page, lets the API
// resolve its draft content instead of the (possibly empty/stale) vault Card row — see
// annotationService.ts's resolveDraftTarget doc comment.
export const runAnnotationProcess = (
  process: AnnotationProcess,
  cardId: string,
  selection?: { cardId: string; text: string },
  pageCardId?: string,
  instruction?: string,
) =>
  request<{ cards: Card[] }>("/annotations/run", {
    method: "POST",
    body: JSON.stringify({ process, cardId, selection, pageCardId, instruction }),
  });
export const createManualHighlight = (
  cardId: string,
  anchor: string,
  color: string,
  text?: string,
  pageCardId?: string,
) =>
  request<Card>("/annotations/highlight", {
    method: "POST",
    body: JSON.stringify({ cardId, anchor, color, text, pageCardId }),
  });
export const acceptDiff = (cardId: string, annotationId: string, pageCardId?: string) =>
  request<Card>(`/annotations/${cardId}/${annotationId}/accept`, {
    method: "POST",
    body: JSON.stringify({ pageCardId }),
  });
export const acceptAllDiffs = (cardId: string, pageCardId?: string) =>
  request<Card>(`/annotations/${cardId}/accept-all`, {
    method: "POST",
    body: JSON.stringify({ pageCardId }),
  });
export const removeAnnotation = (cardId: string, annotationId: string) =>
  request<Card>(`/annotations/${cardId}/${annotationId}`, { method: "DELETE" });
export const updateAnnotationText = (cardId: string, annotationId: string, text: string) =>
  request<Card>(`/annotations/${cardId}/${annotationId}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
