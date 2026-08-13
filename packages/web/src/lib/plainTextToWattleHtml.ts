/** Same escaping Dock.tsx's own buildConvertHtml uses for a plain-text Quote before
 *  splicing it into an HTML blob — duplicated rather than imported since it's two
 *  lines and pulling it into a shared module isn't worth the extra indirection for
 *  either call site. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Extracted/OCR'd plain text -> Wattle rich-text HTML: blank-line-separated blocks
 * become `<p>`, single newlines within a block become `<br>`, everything
 * HTML-escaped. Deliberately NOT `markdownToWattleHtml.ts`: OCR output isn't
 * markdown, and running it through the markdown pipeline would turn incidental "#",
 * "*", "1.", "_" characters into headings/lists/emphasis that were never in the
 * source document. Produces only `<p>`/`<br>`, both unconditionally valid against
 * Wattle's rich-text schema, so no `htmlToDoc` validation round trip is needed the
 * way `markdownToWattleHtml.ts`'s own conversion does.
 */
export function plainTextToWattleHtml(text: string): string {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "<p></p>";
  return blocks.map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("");
}
