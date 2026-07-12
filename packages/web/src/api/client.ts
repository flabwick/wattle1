import type {
  Card,
  CreateCardInput,
  GeneratedCardPart,
  GenerateResponse,
  Page,
  PageCard,
  PageCardWithCard,
  PageWithCards,
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

// Vault
export const listCards = (q?: string) =>
  request<Card[]>(`/cards${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getCard = (id: string) => request<Card>(`/cards/${id}`);
export const createCard = (input: CreateCardInput) =>
  request<Card>("/cards", { method: "POST", body: JSON.stringify(input) });
export const updateCard = (id: string, input: UpdateCardInput) =>
  request<Card>(`/cards/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteCard = (id: string) => request<void>(`/cards/${id}`, { method: "DELETE" });

// Pages
export const listPages = () => request<PageWithCards[]>("/pages");
export const createPage = (order?: number) =>
  request<Page>("/pages", {
    method: "POST",
    body: JSON.stringify(order !== undefined ? { order } : {}),
  });
export const deletePage = (id: string) => request<void>(`/pages/${id}`, { method: "DELETE" });
export const reorderPages = (orderedIds: string[]) =>
  request<void>("/pages/reorder", { method: "PUT", body: JSON.stringify({ orderedIds }) });

// Page <-> Card membership
export const addExistingCardToPage = (pageId: string, cardId: string) =>
  request<PageCard>(`/pages/${pageId}/cards`, { method: "POST", body: JSON.stringify({ cardId }) });
export const addNewCardToPage = (pageId: string, title: string, content: string) =>
  request<PageCardWithCard>(`/pages/${pageId}/cards`, {
    method: "POST",
    body: JSON.stringify({ title, content }),
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

// Generation Rule — the streaming calls themselves (GET /generate/stream/:pageCardId,
// or /stream/page/:pageId for the "nothing selected" case) go through
// useGeneration.ts's EventSource, not this REST client. This is only the accept step:
// persisting a ghost card the user reviewed after that stream finished. No model call
// happens here.
export const acceptGeneration = (
  target: { pageCardId: string } | { pageId: string },
  generated: { title: string; cardType?: string; parts: GeneratedCardPart[] },
) =>
  request<GenerateResponse>("/generate/accept", {
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
) =>
  request<{ cards: Card[] }>("/annotations/run", {
    method: "POST",
    body: JSON.stringify({ process, cardId, selection, pageCardId }),
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
