/**
 * The card-material vocabulary — a curated subset of tokens.css's own named
 * MATERIALS palette (packages/web/src/styles/tokens.css's "Paper & Wood Brutalism"
 * block: --material-linen/cardstock/parchment/oak/walnut/leather/leather-dark/ink/
 * oxblood/brass/slate/highlighter), exposed as something a Card can be styled with
 * (CardInfoPanel.tsx's own "Material" section, rendered via CardShell.css's own
 * `[data-material]` rules).
 *
 * Deliberately excludes four of the thirteen tokens, each for a specific reason:
 * - linen — "the desk itself, page canvas" (tokens.css's own comment); a Card
 *   styled to match the canvas behind it would look like a rendering bug, not a
 *   choice.
 * - cardstock/cardstock-raised — a Card's own plain, unstyled surface already IS
 *   this; "no material chosen" already renders it, so it isn't a separate pickable
 *   option.
 * - ink — borders/text/shadow only ("never pure black" but functionally reserved);
 *   filling a whole Card with it would read as broken, not as a material choice.
 * - highlighter — tokens.css's own comment reserves it for text selection only, and
 *   CardShell.css's `.card-shell--selected` already mixes it into the selection
 *   wash — reusing it as a Card's own permanent material would collide with that
 *   existing "you're selecting this" meaning.
 *
 * This lives in @wattle/shared (not packages/web) because cardMetadata.ts's own
 * `cardMetadataV1Schema` validates `metadata.material` against this exact list
 * (`z.enum(CARD_MATERIAL_IDS)`), and that schema runs server-side (packages/api),
 * which never depends on @wattle/web.
 */
export const CARD_MATERIAL_IDS = [
  "parchment",
  "oak",
  "walnut",
  "leather",
  "leatherDark",
  "slate",
  "brass",
  "oxblood",
] as const;

export type CardMaterialId = (typeof CARD_MATERIAL_IDS)[number];
