/** The fixed palette highlights can use — matches
 *  packages/prompt-engine/prompts/highlight/system.md's own list, so an AI-suggested
 *  highlight's `color` always resolves to a real swatch here too. Any other value
 *  (a future prompt-file change, or malformed input) falls back to "yellow" rather
 *  than rendering nothing. */
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "orange"] as const;
export type HighlightColorName = (typeof HIGHLIGHT_COLORS)[number];

/** The CSS custom property one of the palette names resolves to — see
 *  styles/tokens.css's `--annot-highlight-*` set. */
export function highlightColorValue(color: string): string {
  const name = (HIGHLIGHT_COLORS as readonly string[]).includes(color) ? color : "yellow";
  return `var(--annot-highlight-${name})`;
}
