/**
 * Shared domain types for Wattle — the vault/Pages/Cards workspace described in spec1.md.
 * Consumed by both @wattle/api and @wattle/web so the data model is defined exactly once
 * (spec1.md Part 4: "Separate the Brain from the Face").
 */

import type { CardMetadataV1 } from "./registries/cardMetadata.js";
import type { AppScope, AppSnapshotV1 } from "./registries/appSnapshot.js";

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
  /** Which vault Folder this Card sits in, or null for the vault root. */
  folderId: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateCardInput {
  title: string;
  content: string;
  /** Raw, unvalidated — the API validates against CardMetadataV1 before persisting. */
  metadata?: unknown;
  /** Vault Folder to create the Card in — omit or null for the vault root. */
  folderId?: string | null;
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

/** A Page — an ordered stack slot within a Tab. `order` is ascending from bottom (0)
 *  to top. */
export interface Page {
  id: string;
  order: number;
  createdAt: string;
  updatedAt: string;
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

/** A reusable Tab or Page template — see schema.prisma's App model and
 *  registries/appSnapshot.ts's AppSnapshotV1. */
export interface App {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  scope: AppScope;
  isCore: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** An App plus its full (server-built) template payload — GET /api/apps/:id and the
 *  create/update responses, as opposed to the lightweight GET /api/apps list. */
export interface AppWithSnapshot extends App {
  snapshot: AppSnapshotV1;
}

/**
 * Save-as-App and re-save-on-Edit both go through this shape: exactly one of `tabId`/
 * `pageId` must be set (determines `scope`), and the API always (re)builds the
 * snapshot itself from that Tab/Page's real current data — never from a payload the
 * browser constructed.
 */
export interface CreateAppInput {
  name: string;
  description?: string | null;
  tabId?: string;
  pageId?: string;
}

export interface UpdateAppSnapshotInput {
  tabId?: string;
  pageId?: string;
}

/** Required only when opening a scope: "page" App — which Tab to append the fresh
 *  Page into. Ignored for a scope: "tab" App, which always gets a brand-new Tab. */
export interface OpenAppInput {
  tabId?: string;
}

/** Ids of what "opening" an App just instantiated, so the frontend can navigate
 *  straight to it. */
export interface OpenAppResult {
  scope: AppScope;
  tabId: string;
  pageId: string;
}

/** A Folder in the vault — see schema.prisma's Folder model. */
export interface Folder {
  id: string;
  title: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One screen's worth of vault browsing: a Folder's immediate children (subfolders and
 * Cards, not recursive) plus the ancestor chain to render as a breadcrumb. `folder` is
 * null and `breadcrumb` is empty at the vault root.
 */
export interface FolderContents {
  folder: Folder | null;
  /** Root-to-parent order, not including `folder` itself. */
  breadcrumb: Folder[];
  folders: Folder[];
  cards: Card[];
}
