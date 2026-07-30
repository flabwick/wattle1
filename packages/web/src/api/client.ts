import type {
  App,
  AppWithSnapshot,
  Card,
  CreateAppInput,
  CreateCardInput,
  DockCardWithCard,
  Folder,
  FolderContents,
  GeneratedCardPart,
  GenerateResponse,
  OpenAppInput,
  OpenAppResult,
  Page,
  PageCard,
  PageCardWithCard,
  PageWithCards,
  StackData,
  StackMember,
  StackMemberWithCard,
  Tab,
  UpdateAppSnapshotInput,
  UpdateCardInput,
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

// Apps — reusable Tab/Page templates (Apps feature spec). Snapshots are always built
// server-side from a real Tab/Page reference; this client only ever sends ids.
export const listApps = () => request<App[]>("/apps");
export const getApp = (id: string) => request<AppWithSnapshot>(`/apps/${id}`);
export const createApp = (input: CreateAppInput) =>
  request<AppWithSnapshot>("/apps", { method: "POST", body: JSON.stringify(input) });
export const updateAppSnapshot = (id: string, input: UpdateAppSnapshotInput) =>
  request<AppWithSnapshot>(`/apps/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteApp = (id: string) => request<void>(`/apps/${id}`, { method: "DELETE" });
export const openApp = (id: string, input: OpenAppInput = {}) =>
  request<OpenAppResult>(`/apps/${id}/open`, { method: "POST", body: JSON.stringify(input) });

// Vault
export const listCards = (q?: string) =>
  request<Card[]>(`/cards${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getCard = (id: string) => request<Card>(`/cards/${id}`);
export const createCard = (input: CreateCardInput) =>
  request<Card>("/cards", { method: "POST", body: JSON.stringify(input) });
export const updateCard = (id: string, input: UpdateCardInput) =>
  request<Card>(`/cards/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteCard = (id: string) => request<void>(`/cards/${id}`, { method: "DELETE" });
export const moveCard = (id: string, folderId: string | null) =>
  request<Card>(`/cards/${id}/move`, { method: "PATCH", body: JSON.stringify({ folderId }) });
/** Direct URL (not routed through `request()`) for a "file"-typed Card's uploaded
 *  bytes — used as an <iframe>/<img> src or fetched as raw text, never as JSON. */
export const getCardFileUrl = (id: string) => `/api/cards/${id}/file`;

// Vault Folders
export const getFolderContents = (folderId: string | null) =>
  request<FolderContents>(`/folders/contents${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`);
export const createFolder = (title: string, parentId: string | null) =>
  request<Folder>("/folders", { method: "POST", body: JSON.stringify({ title, parentId }) });
export const renameFolder = (id: string, title: string) =>
  request<Folder>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
export const moveFolder = (id: string, parentId: string | null) =>
  request<Folder>(`/folders/${id}/move`, { method: "PATCH", body: JSON.stringify({ parentId }) });
export const deleteFolder = (id: string) => request<void>(`/folders/${id}`, { method: "DELETE" });

// Tabs — the horizontal layer above Pages (Step 6 spec §1.1).
export const listTabs = () => request<Tab[]>("/tabs");
export const createTab = (title?: string) =>
  request<Tab>("/tabs", { method: "POST", body: JSON.stringify(title ? { title } : {}) });
export const deleteTab = (id: string) => request<void>(`/tabs/${id}`, { method: "DELETE" });

// Pages
export const listPages = (tabId: string) =>
  request<PageWithCards[]>(`/pages?tabId=${encodeURIComponent(tabId)}`);
export const createPage = (tabId: string, order?: number) =>
  request<Page>("/pages", {
    method: "POST",
    body: JSON.stringify(order !== undefined ? { tabId, order } : { tabId }),
  });
export const deletePage = (id: string) => request<void>(`/pages/${id}`, { method: "DELETE" });
export const reorderPages = (orderedIds: string[]) =>
  request<void>("/pages/reorder", { method: "PUT", body: JSON.stringify({ orderedIds }) });

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
