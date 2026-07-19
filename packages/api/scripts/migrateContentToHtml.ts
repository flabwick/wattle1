/**
 * One-time migration: converts every "note"-typed Card's `content` (and every
 * PageCard's `draftContent`) from the pre-richText plain-text-with-`[[cardId]]`-
 * tokens format into HTML, so the new TipTap-based editor (richtext/CardRichText.tsx)
 * can read it. Not wired into any npm script or app startup — run manually, once,
 * against the dev DB:
 *
 *   npx tsx packages/api/scripts/migrateContentToHtml.ts [--dry-run]
 *
 * file/link-typed Cards are skipped entirely — they don't use `content` for prose
 * (see packages/shared/src/registries/definitions/fileCardType.ts/linkCardType.ts).
 * Idempotent: a row whose content already contains a <wattle-embed> tag or parses as
 * a non-trivial rich-text doc is assumed already migrated and left alone, so this is
 * safe to re-run. Each row is written independently rather than inside one large
 * wrapping transaction — deliberately: if this crashes partway through a big table,
 * whatever already succeeded stays converted, and a re-run (idempotent, see above)
 * picks up wherever it left off, rather than one bad row rolling back everything
 * that came before it.
 */
import { prisma } from "../src/db.js";
import { parseCardRefs, htmlToDoc } from "@wattle/shared";

const DRY_RUN = process.argv.includes("--dry-run");

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One plain-text segment (parseCardRefs.ts's "text" kind) → one-or-more `<p>`
 *  blocks, splitting on blank lines the same way richText/plainText.ts's
 *  BLOCK_SEPARATOR ("\n\n") does on the way back out, so a round-trip through the
 *  new editor doesn't reflow anything. A lone newline within a paragraph becomes a
 *  <br>, mirroring the old auto-growing textarea's soft-wrap-preserving behavior. */
function textSegmentToHtml(text: string): string {
  const paragraphs = text.split("\n\n");
  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Matches the start of an HTML opening tag (`<p>`, `<wattle-embed ...>`, `<strong>`,
 *  ...) — not a full HTML validator, just enough to tell "this string has markup in
 *  it" from "this is plain text with maybe a stray `<`/`>` character typed by a
 *  user", which the old plain-text format (and its system prompt, which explicitly
 *  forbade any markup) essentially never produced. */
const HTML_TAG_PATTERN = /<[a-zA-Z][a-zA-Z0-9-]*[\s/>]/;

/** True if `content` is plausibly already HTML (from this migration, or
 *  hand-authored since) rather than the old plain-text format — checked before
 *  converting so a second run against the same DB is a no-op instead of
 *  double-escaping. A heuristic, not a guarantee: doc.childCount-based checks were
 *  considered and rejected — old plain text with blank-line-separated paragraphs
 *  converts to *multiple* <p> blocks too, so "more than one top-level block" isn't a
 *  reliable "already migrated" signal on its own. --dry-run is there to spot-check
 *  before committing to a real run. */
function looksAlreadyMigrated(content: string): boolean {
  if (!content.trim()) return true; // nothing to convert either way
  return HTML_TAG_PATTERN.test(content);
}

function convertContent(content: string): string {
  const segments = parseCardRefs(content);
  if (segments.length === 0) return "";
  return segments
    .map((segment) =>
      segment.type === "text"
        ? textSegmentToHtml(segment.value)
        : `<wattle-embed data-card-id="${segment.cardId}"></wattle-embed>`,
    )
    .join("");
}

async function migrateCards() {
  const cards = await prisma.card.findMany();
  let migrated = 0;
  let skippedType = 0;
  let skippedAlready = 0;
  let failed = 0;

  for (const card of cards) {
    let typeId: string | undefined;
    try {
      typeId = JSON.parse(card.metadata)?.typeId;
    } catch {
      typeId = undefined;
    }
    if (typeId && typeId !== "note") {
      skippedType++;
      continue;
    }
    if (looksAlreadyMigrated(card.content)) {
      skippedAlready++;
      continue;
    }

    const html = convertContent(card.content);
    try {
      htmlToDoc(html);
    } catch (err) {
      console.error(`[card ${card.id}] produced invalid HTML, skipping:`, err);
      failed++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[card ${card.id}]\n  before: ${JSON.stringify(card.content)}\n  after:  ${JSON.stringify(html)}`);
    } else {
      await prisma.card.update({ where: { id: card.id }, data: { content: html } });
    }
    migrated++;
  }

  console.log(
    `Cards: ${migrated} migrated, ${skippedType} skipped (non-note type), ${skippedAlready} skipped (already migrated), ${failed} failed`,
  );
}

async function migrateDraftContent() {
  const pageCards = await prisma.pageCard.findMany({
    where: { draftContent: { not: null } },
    include: { card: true },
  });
  let migrated = 0;
  let skippedType = 0;
  let skippedAlready = 0;
  let failed = 0;

  for (const pageCard of pageCards) {
    const draftContent = pageCard.draftContent;
    if (draftContent === null) continue;

    let typeId: string | undefined;
    try {
      typeId = JSON.parse(pageCard.card.metadata)?.typeId;
    } catch {
      typeId = undefined;
    }
    if (typeId && typeId !== "note") {
      skippedType++;
      continue;
    }
    if (looksAlreadyMigrated(draftContent)) {
      skippedAlready++;
      continue;
    }

    const html = convertContent(draftContent);
    try {
      htmlToDoc(html);
    } catch (err) {
      console.error(`[pageCard ${pageCard.id}] produced invalid HTML, skipping:`, err);
      failed++;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `[pageCard ${pageCard.id}]\n  before: ${JSON.stringify(draftContent)}\n  after:  ${JSON.stringify(html)}`,
      );
    } else {
      await prisma.pageCard.update({ where: { id: pageCard.id }, data: { draftContent: html } });
    }
    migrated++;
  }

  console.log(
    `PageCard drafts: ${migrated} migrated, ${skippedType} skipped (non-note type), ${skippedAlready} skipped (already migrated), ${failed} failed`,
  );
}

async function main() {
  if (DRY_RUN) console.log("--dry-run: no writes will be made\n");
  await migrateCards();
  await migrateDraftContent();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
