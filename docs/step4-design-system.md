# Step 4 — Design System (Olive Styling / Refined Neo-Brutalism)

[docs/styling.md](./styling.md) ("Olive Styling: Refined Neo-Brutalism") is a visual
spec, not code — this step encodes it as tokens in `packages/web/src/styles/tokens.css`
and a handful of primitives in `packages/web/src/components/primitives/`, so the app
gets styling.md's look by construction rather than by every component author
remembering the rules. Nothing new architecturally: this extends the Step 3 tokens +
primitives layer (see that step's doc and `components/primitives/README.md`), it
doesn't replace it.

## The rule this step follows

**Every color, border width, shadow, and font stack in `packages/web/src/components/`
comes from a `tokens.css` variable.** If a component needs a value tokens.css doesn't
have, the fix is to add a token, not to hardcode a pixel value or hex color in the
component's `.css` file. `grep -rn "#[0-9a-fA-F]\{3,6\}" packages/web/src/components`
should only ever match token *definitions*, never a component file — that's how you can
tell the rule is holding.

## Mapping styling.md → tokens.css

| styling.md section | Rule | Token(s) |
|---|---|---|
| §2 Palette character | Warm parchment/linen/oak/cream backgrounds | `--color-bg`, `--color-surface`, `--color-surface-raised` |
| §2 Primary brights | Heritage tones: amber, terracotta, aubergine, muted teal | `--color-accent` (terracotta, the dominant one), `--color-accent-secondary` (teal), `--color-accent-tertiary` (aubergine), `--color-highlight` (amber) |
| §2 Dark accents | Espresso/charcoal for text and outlines, never pure black | `--color-text`, `--color-border-strong` |
| §2 Retro terminal screens | Dark walnut/peat bg, amber/warm-green/cream mono text | `--color-terminal-bg`, `--color-terminal-text`, `--color-terminal-border` — see "The terminal, concretely" below |
| §2 Usage rules | One dominant accent color per screen | `--color-accent` is the only accent `Button`/`CardShell` reach for by default; `--color-accent-secondary`/`--color-accent-tertiary` exist for a future second accent, not used by default today (see "What's unused" below) |
| §4 Typography | Humanist sans for UI + warm serif for headlines/labels | `--font-family-base` (sans), `--font-family-heading` (serif) |
| §4 Tracking | Slightly increased tracking on editorial text | `--tracking-wide` |
| §4 All-caps as "bespoke labels or archive stamps" | Small bordered, uppercase, mono-set label | `Badge` primitive + `.page__label` (PageStack.css) both apply this treatment |
| §5 Cards and panels | Medium rounded corners; 2px warm charcoal/espresso borders | `--radius-md`, `--border-width-bold` + `--color-border-strong` |
| §5 Dividers and grids | Thin rules / dashed separators, distinct from card borders | `--border-width-thin` + `--color-border` (a *softer* color than card borders — see "Two border tokens" below) |
| §7 Buttons | Tactile, physical: bold outline, warm offset shadow, press compresses it | `Button.css`'s `--shadow-button` / `--shadow-button-pressed` + `:active` transform |
| §8 Surfaces, depth, shadows | Structural outlines + warm material-aware shadows, not heavy blur | `--shadow-card`, `--shadow-button` — both solid offsets (`Npx Npx 0 color`), zero blur radius, by design |

## Two border tokens, on purpose

`--color-border` (soft, muted — oak-toned in light mode) and `--color-border-strong`
(bold espresso/charcoal) are deliberately separate, because styling.md asks for two
different border jobs:

- **Structural edges** — a Card, a Button, an InputField, a Page folio — get
  `--border-width-bold solid var(--color-border-strong)`. These are the "thick stock or
  leather-wrapped folio" objects (§5).
- **Divider lines** — the dock's vault panel, a stream-preview readout's inner rule —
  get the softer `--color-border` at `--border-width-thin`, since styling.md's §5
  "Dividers and grids" describes these as quiet, not structural.

If you're styling something and unsure which to reach for, ask: "is this an object, or
a line between objects?" Objects get `border-strong` + a shadow; lines get `border`
alone.

## Shadows are solid offsets, not blur

styling.md §8 is explicit that depth comes from "structural outlines and warm,
material-aware shadows rather than heavy blur." Concretely, `--shadow-card` and
`--shadow-button` are `Npx Npx 0 var(--color-shadow)` — a flat, zero-blur offset, the
classic neo-brutalist "object sitting on the surface" shadow. `Button`'s `:active`
state (`Button.css`) swaps to `--shadow-button-pressed` (`0 0 0`) and translates the
button by the same offset, so pressing it reads as the button physically sinking flush
to the surface — styling.md §9's "well-oiled drawer" cue, done in pure CSS with no JS
or animation library.

## The terminal, concretely

styling.md §2 calls out "retro terminal screens: dark walnut or deep peat backgrounds
with amber, warm green, or cream monospace text" as a distinct material from the rest of
the UI. The app has exactly one place this applies literally: `Dock.tsx`'s
`.dock__stream-preview`, the live text streaming in during a generation. It's styled
with `--color-terminal-bg`/`--color-terminal-text`/`--color-terminal-border` and
`--font-family-mono` — and those three terminal tokens are **not** overridden in the
`prefers-color-scheme: dark` block in tokens.css, unlike every other color role. A
terminal readout is a screen-within-a-screen; it should look the same dark-on-amber
regardless of whether the surrounding app is in light or dark mode, the same way a real
CRT doesn't change when you dim the room.

## What's unused today

`--color-accent-secondary` (teal) and `--color-accent-tertiary` (aubergine) are defined
in both light and dark palettes but no component reaches for them yet — styling.md's
"one dominant accent per screen" rule means the app's single accent (`--color-accent`,
terracotta) is enough for every button/card/badge that exists today. The two extra
heritage tones are there for whenever a second accent is genuinely needed (e.g. a future
second `CardType` that wants its own identity color) — add the CSS class that uses them
at that point rather than wiring them in speculatively now.

## Deliberately-bespoke exception: `.page-stack__add`

Per the primitives README's "why this exists" section, `PageStack.css`'s dashed
"+ New Page" button is the one hand-rolled box-model rule left outside
`components/primitives/` after this step. It's a dashed, full-width "add a slot"
affordance that nothing else in the app shares — turning it into a `Button` variant
would mean a variant with exactly one caller, which is the premature-abstraction case
the rest of this codebase avoids. It still consumes only `tokens.css` variables
(`--border-width-bold`, `--color-border-strong`, `--font-family-heading`, etc.), so the
"no hardcoded values" rule holds even though the "goes through a primitive" one doesn't.

## Verifying a change holds the system together

After touching any component's `.css`:

1. `grep -rn "#[0-9a-fA-F]\{3,6\}\|[0-9]px solid\|font-family:\s*[\"']"
   packages/web/src/components` — should only surface `tokens.css`-style `var(...)`
   usage, not new literals.
2. Check both color schemes render sanely — toggle OS light/dark mode (or override
   `prefers-color-scheme` in devtools) and confirm text/border contrast still holds;
   the dark-mode palette in `tokens.css` is a separate set of values, not an automatic
   invert.
3. If you added a new primitive or converted a component to use an existing one, update
   `components/primitives/README.md`'s table — it's the canonical list of what exists.
