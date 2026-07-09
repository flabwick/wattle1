import type {
  Card,
  CreateCardInput,
  GenerateResponse,
  Page,
  PageCard,
  PageCardWithCard,
  PageWithCards,
  UpdateCardInput,
} from "@wattle/shared";

/**
 * Thin fetch wrapper around the API. This is the *only* place the web client talks
 * HTTP — every other module deals in shared types (spec1.md Part 4 "Separate the
 * Brain from the Face": no business logic lives in the frontend).
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Vault
export const listCards = (q?: string) =>
  request<Card[]>(`/cards${q ? `?q=${encodeURIComponent(q)}` : ""}`);
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

// Generation Rule
export const generateFromPageCard = (pageCardId: string) =>
  request<GenerateResponse>("/generate", { method: "POST", body: JSON.stringify({ pageCardId }) });
