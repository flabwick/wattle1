/**
 * The exact set of design tokens (packages/web/src/styles/tokens.css) a
 * `js`-typed Card's own sandboxed iframe needs to render `wattle.ui.*` controls
 * that look like the rest of the app — a button that looks like `Button`, a
 * field that looks like `InputField`, matching materials/light/dark palette,
 * automatically. "Automatically" is the point: this reads the CURRENT resolved
 * value of each token from the live document at render time
 * (`getComputedStyle`), rather than a hand-picked hex palette living in this
 * app's own source — if tokens.css changes, or the user is in dark mode, or a
 * future theme picker exists, the sandbox's own look follows without this file
 * needing an update. The sandboxed iframe can't inherit CSS custom properties
 * from the parent document directly (a separate, same-origin-less document —
 * see wattleSandboxBootstrap.ts's own doc comment), so the *resolved* values
 * are computed here and passed across as plain strings instead.
 */
const SANDBOX_TOKEN_NAMES = [
  "--color-bg",
  "--color-surface",
  "--color-surface-raised",
  "--color-border",
  "--color-border-strong",
  "--color-text",
  "--color-text-muted",
  "--color-accent",
  "--color-accent-text",
  "--color-accent-secondary",
  "--color-accent-secondary-text",
  "--color-danger",
  "--color-danger-text",
  "--color-shadow",
  "--shadow-button",
  "--shadow-button-pressed",
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--radius-sm",
  "--radius-md",
  "--border-width-thin",
  "--border-width-bold",
  "--font-family-base",
  "--font-family-mono",
  "--font-size-sm",
  "--font-size-base",
  "--font-weight-bold",
  "--touch-target-min",
  "--touch-target-sm",
  "--duration-strike",
  "--ease-strike",
] as const;

export type SandboxThemeTokens = Record<(typeof SANDBOX_TOKEN_NAMES)[number], string>;

/** Reads every token's own resolved value off `el` (the Card's own DOM node
 *  when available, so a `data-material` override on that specific element is
 *  honored too — falls back to `document.documentElement` for the global
 *  palette either way, since materials never override the tokens a script's
 *  own content actually uses — see CardShell.css's own doc comment: "the
 *  content area is always the ordinary cardstock surface"). */
export function readSandboxThemeTokens(el: Element | null): SandboxThemeTokens {
  const computed = getComputedStyle(el ?? document.documentElement);
  const tokens = {} as SandboxThemeTokens;
  for (const name of SANDBOX_TOKEN_NAMES) {
    tokens[name] = computed.getPropertyValue(name).trim();
  }
  return tokens;
}
