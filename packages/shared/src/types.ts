/**
 * Shared domain types for Wattle — the vault/Pages/Cards workspace described in spec1.md.
 * Consumed by both @wattle/api and @wattle/web so the data model is defined exactly once
 * (spec1.md Part 4: "Separate the Brain from the Face").
 */

import type { CardMetadataV1 } from "./registries/cardMetadata.js";
import type { TemplateScope, TemplateSnapshotV1 } from "./registries/templateSnapshot.js";

/** A Card as it lives in the vault — the single source of truth for its saved content. */
export interface Card {
  id: string;
  title: string;
  content: string; // markdown
  /** Versioned, extensible per-Card data — see registries/cardMetadata.ts. */
  metadata: CardMetadataV1;
  /** Whether this Card independently exists in the Vault (searchable/listable there)
   *  yet, or is still page-local scratch content — see schema.prisma's Card model. */
  savedToVault: boolean;
  /** Null while Open (editable in place). Set (ISO 8601) once Frozen — read-only,
   *  safe as stable context. Editing a Frozen Card always forks a new Card rather
   *  than mutating it — see cardService.ts's freezeCard/forkCard. */
  frozenAt: string | null;
  /** Set only on a Card created by forking a Frozen Card — points at the Frozen
   *  original it was copied from. */
  forkedFromId: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateCardInput {
  title: string;
  content: string;
  /** Raw, unvalidated — the API validates against CardMetadataV1 before persisting. */
  metadata?: unknown;
}

export interface UpdateCardInput {
  title?: string;
  content?: string;
  /** Raw, unvalidated. Omit to leave the Card's existing metadata untouched. */
  metadata?: unknown;
}

/**
 * A Tab — a horizontal slot holding its own independent stack of Pages (Step 6 spec
 * §1.1). Tabs don't share Pages or generation context with each other. `order` is
 * ascending left (0) to right.
 */
export interface Tab {
  id: string;
  order: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** A Page — a destination you go to (Pages + Links + Search rebuild's locked
 *  primitive). `order` is a legacy ordering value, still used within a
 *  `siblingGroupId` (a former Tab's stack, or any explicit next/prev trail) via
 *  `orderInGroup`; it no longer means anything across the whole Page table. */
export interface Page {
  id: string;
  /** Null is a valid, common state — a loose/unlinked scratch Page never forces the
   *  user to name it. "Claimed" (named and/or linked from Home, or pinned) is derived
   *  client-side from this plus `pinnedOrder`/inbound links, not its own flag. */
  title: string | null;
  order: number;
  /** Groups this Page with former stack-mates (see the schema's own doc comment) —
   *  null for a Page that was never part of one. */
  siblingGroupId: string | null;
  orderInGroup: number | null;
  /** Non-null places this Page in the scarce pin rail, ascending display order. */
  pinnedOrder: number | null;
  /** Homes + Pages hierarchy: null means this Page is a Home (a root — detected
   *  automatically from the absence of a parent, not a separate flag). */
  parentPageId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A Page -> Page navigation link — the rebuild's "Link" primitive, distinct from a
 *  Card embed and from an external URL. */
export interface PageLink {
  id: string;
  sourcePageId: string;
  targetPageId: string;
  createdAt: string;
}

/** Single-row app preferences — which Page is Home, in GET/PUT /api/settings. */
export interface UserSettings {
  homePageId: string | null;
}

export interface SearchPagesQuery {
  q?: string;
}

/** One Page search/listing result, with just enough denormalized info for a list row
 *  — never the full PageWithCards payload (that's only fetched once a specific Page
 *  is actually opened). */
export interface PageSummary {
  id: string;
  title: string | null;
  pinnedOrder: number | null;
  updatedAt: string;
  /** First top-level Card's title, for a list row preview when the Page itself has
   *  no title yet. */
  preview: string | null;
}

/**
 * A Card's placement inside a Page. This is a join, not the Card itself, because a Card
 * can be opened into a Page, edited there in a draft state, and only persisted back to
 * the vault Card row when explicitly saved (spec1.md "Save a Card back to the vault").
 *
 * If draftTitle/draftContent are non-null, the Dock is showing unsaved edits; the vault
 * Card's title/content are unchanged until POST /page-cards/:id/save.
 */
export interface PageCard {
  id: string;
  pageId: string;
  cardId: string;
  order: number;
  draftTitle: string | null;
  draftContent: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A PageCard joined with its underlying Card, as returned by the API for rendering. */
export interface PageCardWithCard extends PageCard {
  card: Card;
}

export interface PageWithCards extends Page {
  pageCards: PageCardWithCard[];
}

/** One PageCard's full recoverable state at a point in time — the unit the full
 *  state system (history/undo/redo/versions) snapshots before/after a change. See
 *  HistoryEntry below: a "structural" entry (add/remove/move/reorder) snapshots
 *  every PageCard on the Page, since reordering/removal shifts siblings' `order`
 *  too; a "content" entry (a text/metadata edit, or a generation) snapshots only
 *  the touched card(s). Restoring an entry upserts every PageCardSnapshot present
 *  in the target array and deletes any PageCard id present in the entry's other
 *  array but absent from the target one — see the API's historyService.ts. */
export interface PageCardSnapshot {
  pageCardId: string;
  order: number;
  cardId: string;
  title: string;
  content: string;
  metadata: unknown;
}

/** The full state system's history log entry — see PageCardSnapshot above and
 *  historyService.ts. `kind: "edit"` entries back the Dock's Undo/Redo; `kind:
 *  "generation"` entries back its Back/Forward (before/after an AI generation).
 *  `cardIds` is the operation's own target/selection (not every card touched by a
 *  structural snapshot) — a card-scoped Undo/Redo/Back/Forward only ever considers
 *  entries whose cardIds is a subset of the current selection. */
export interface HistoryEntry {
  id: string;
  pageId: string;
  kind: "edit" | "generation";
  label: string;
  cardIds: string[];
  before: PageCardSnapshot[];
  after: PageCardSnapshot[];
  undoneAt: string | null;
  createdAt: string;
}

/** "page" for the page-wide history views, or an explicit set of Card ids for a
 *  selection-scoped view (the Dock auto-scopes its Undo/Redo/Back/Forward to the
 *  current card selection — see useHistory.ts). */
export type HistoryScope = "page" | string[];

/**
 * A Card living outside any Page/Tab — the persistent Dock scratchpad layer (Step 6
 * spec §1.2). Never part of generation context. `order` positions it in the Dock's
 * horizontal scroll row. Unlike PageCard, there's no draft staging: editing a Dock
 * Card writes straight through to its Card row, same convention as an embedded Card
 * (CardEmbed.tsx) — there's no separate vault-sync step to distinguish it from.
 */
export interface DockCard {
  id: string;
  cardId: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface DockCardWithCard extends DockCard {
  card: Card;
}

/**
 * One alternate belonging to a "stack"-typed Card (registries/definitions/
 * stackCardType.ts) — the Stack's own counterpart to PageCard, including the same
 * draft-staging convention: non-null draftTitle/draftContent mean this alternate has
 * unsaved edits, committed to its own vault Card via POST /stacks/members/:id/save.
 * Only the alternate at index `StackData.activeIndex` is "in" the page.
 */
export interface StackMember {
  id: string;
  stackCardId: string;
  cardId: string;
  order: number;
  draftTitle: string | null;
  draftContent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StackMemberWithCard extends StackMember {
  card: Card;
}

/** A Stack's full state, as returned by GET /api/stacks/:stackCardId — every alternate,
 *  in order, plus which one is currently active (already clamped to the list's bounds
 *  server-side, so callers never need to re-check it against `members.length`). */
export interface StackData {
  activeIndex: number;
  members: StackMemberWithCard[];
}

/**
 * The Generation Rule (spec1.md Part 2 + Part 3): everything in Pages above the
 * triggering PageCard's Page, plus everything above the triggering PageCard within its
 * own Page. Nothing below. This is what gets sent to the model as context, and it is
 * always inspectable — the Generation Rule must never be a black box.
 */
export interface GenerationContextEntry {
  pageId: string;
  pageOrder: number;
  pageCardId: string;
  pageCardOrder: number;
  title: string;
  content: string;
}

export interface GenerateRequest {
  pageCardId: string;
}

/** The "prompt" CardType's context-mode selector (cardMetadata.ts's `prompt.context`,
 *  generationService.ts's assemblePromptCardContext) — shared between client
 *  (usePromptGeneration.ts) and server (routes/generate.ts) so both sides read the
 *  same fixed set of values. */
export type PromptCardContextMode = "page" | "tab" | "cards" | "none";

/** One piece of an accepted generation's content, in stream order: either literal
 *  text, or a nested card block to be materialized as its own standalone Card (see
 *  generationService.persistGeneratedCard) and spliced into the parent's content as a
 *  `[[cardId]]` embed reference — the same mechanism CardLinkPicker.tsx uses for
 *  user-created embeds, so an accepted generation's nested cards render and behave
 *  exactly like any other embedded Card, not literal `<card>` markup. */
export type GeneratedCardPart =
  | { kind: "text"; text: string }
  | { kind: "child"; cardType: string; title: string; parts: GeneratedCardPart[] };

export interface GenerateResponse {
  /** The context that was actually sent, in order, for auditability. */
  context: GenerationContextEntry[];
  /** The newly created vault Card holding the model's response. */
  card: Card;
  /** The new PageCard appended directly below the triggering one. */
  pageCard: PageCard;
}

export interface SearchCardsQuery {
  q?: string;
}

/** One hit from GET /api/search/web — see webSearchService.ts. */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Response for GET /api/search/web — the "search" CardType's own web mode
 *  (registries/definitions/searchCardType.ts). Backed by Tavily
 *  (webSearchService.ts); `configured` is false until `TAVILY_API_KEY` is set
 *  (see .env.example), and `results` is always empty in that state rather than the
 *  endpoint erroring, so the UI can show a plain
 *  "not set up yet" notice instead of an error state. */
export interface WebSearchResponse {
  configured: boolean;
  results: WebSearchResult[];
}

/** One successfully extracted page from POST /api/search/web/extract — see
 *  webSearchService.ts's extractPages. `content` is markdown, converted client-side
 *  into a Card via lib/markdownToWattleHtml.ts before being appended to the current
 *  Page (SearchCardBody.tsx's own "export selected" action). */
export interface WebExtractResult {
  url: string;
  title: string | null;
  content: string;
}

/** One URL that failed extraction (a dead link, a page Tavily couldn't fetch, ...) —
 *  reported rather than silently dropped, so the UI can tell the user which of a
 *  multi-URL selection didn't come through. */
export interface WebExtractFailure {
  url: string;
  error: string;
}

/** Response for POST /api/search/web/extract. Same `configured` convention as
 *  WebSearchResponse — false (empty results/failed) until TAVILY_API_KEY is set. */
export interface WebExtractResponse {
  configured: boolean;
  results: WebExtractResult[];
  failed: WebExtractFailure[];
}

/** A reusable Tab or Page template — see schema.prisma's Template model and
 *  registries/templateSnapshot.ts's TemplateSnapshotV1. */
export interface Template {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  scope: TemplateScope;
  isCore: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** A Template plus its full (server-built) snapshot payload — GET /api/templates/:id
 *  and the create/update responses, as opposed to the lightweight GET /api/templates
 *  list. */
export interface TemplateWithSnapshot extends Template {
  snapshot: TemplateSnapshotV1;
}

/**
 * Save-as-Template and re-save-on-Edit both go through this shape: exactly one of
 * `tabId`/`pageId` must be set (determines `scope`), and the API always (re)builds
 * the snapshot itself from that Tab/Page's real current data — never from a payload
 * the browser constructed.
 */
export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  tabId?: string;
  pageId?: string;
}

export interface UpdateTemplateSnapshotInput {
  tabId?: string;
  pageId?: string;
}

/** Opening a Template no longer needs a destination Tab (Pages + Links + Search
 *  rebuild: a fresh Page is a place in its own right) — reserved for future opening
 *  options. */
export type OpenTemplateInput = Record<string, never>;

/** What "opening" a Template just instantiated, so the frontend can navigate
 *  straight to it — always exactly one Page (a `scope: "tab"`/hub Template lands on
 *  its new hub Page, not any one child). */
export interface OpenTemplateResult {
  scope: TemplateScope;
  pageId: string;
}

/** One ranked result from either Nearby query (proximityService's durable graph, or
 *  nearbyService's live re-rank against what's open/typed) — see routes/nearby.ts.
 *  `summary` falls back to `title` server-side when a Card has no auto-summary yet. */
export interface NearbyItem {
  cardId: string;
  title: string;
  summary: string;
  score: number;
}

