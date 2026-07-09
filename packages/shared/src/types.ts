/**
 * Shared domain types for Wattle — the vault/Pages/Cards workspace described in spec1.md.
 * Consumed by both @wattle/api and @wattle/web so the data model is defined exactly once
 * (spec1.md Part 4: "Separate the Brain from the Face").
 */

import type { CardMetadataV1 } from "./registries/cardMetadata.js";

/** A Card as it lives in the vault — the single source of truth for its saved content. */
export interface Card {
  id: string;
  title: string;
  content: string; // markdown
  /** Versioned, extensible per-Card data — see registries/cardMetadata.ts. */
  metadata: CardMetadataV1;
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

/** A Page — an ordered stack slot. `order` is ascending from bottom (0) to top. */
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
