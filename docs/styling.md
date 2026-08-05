
## Paper & Wood Brutalism

### 1. Overall visual identity
- Hard structural bones — thick ink borders, **zero corner radius**, monospace
  labels — carrying warm, worn materials that respond to touch the way real
  objects would. Not neo‑brutalism softened for a screen; the physicality is the
  point.
- Screens read as a **desk, not a UI**: a card is an index card, a panel is a
  leather-bound folio, a button is a rubber stamp. The palette is authored as a
  small set of named **materials** (paper, wood, leather, ink), not as semantic
  hex roles — see `tokens.css`'s own `--material-*` block, which every
  `--color-*` role is a `var()` reference onto.
- Understated on purpose. The brutalism is in the bones (borders, radius, type),
  not in noise or maximalism — grain sits at ~5% opacity and idle motion is
  nearly imperceptible. If a screen looks like it's "trying," it's overdone.

### 2. Color system
#### Materials, not hex roles
- **Linen** — the desk itself, page canvas.
- **Cardstock** / **cardstock, raised** — a card's own surface, and a card
  lifted off the stack (popovers, modals, anything "above" the page).
- **Parchment** — a secondary panel or tray.
- **Oak** / **Walnut** — mid and dark wood, secondary/tertiary accents, held in
  reserve rather than mixed in freely (one dominant accent per screen still
  applies — see the usage rule below).
- **Leather** / **leather, pressed** — the primary accent: buttons, selection,
  anything "chosen." Pressed leather is the toggled-on/active state.
- **Ink** — borders, text, shadows. Never pure black.
- **Oxblood** — stamp-pad red, danger.
- **Brass** — the hardware/stamp accent (Badge, small emphasis) — a distinct
  material from the highlighter tint below; marking content and choosing/
  emphasizing UI are different acts and don't share a color.
- **Slate** — faded pencil: muted text, thin dividers.
- **Highlighter** — a marker-pen tint reserved for text selection and "this is
  part of the current selection" washes (`::selection`, multi-select highlight,
  a selected Card's background). Never used for anything else.

#### Usage rules
- One dominant accent per screen (leather, almost always), oak/walnut reserved
  for secondary/tertiary emphasis.
- Dark mode redefines the *materials* only — every semantic role re-resolves
  automatically, since each is a `var()` onto a material rather than its own
  hardcoded hex pair. A few paired "text on this material" tokens (`--on-leather`
  etc.) flip explicitly alongside it, since which way legibility runs is a
  contrast decision, not a material property.
- Gradients don't appear. A stack of paper doesn't gradient; a shadow does the
  work of suggesting depth instead.

### 3. Layout and spacing
- Single‑column mobile layout, centered with generous, editorial padding.
- Cards stack vertically with consistent, measured gaps — the rhythm is
  deliberate, index‑card spacing, not cramped or playful.
- Each card follows three zones: a refined title/header strip, spacious main
  content, and a subtle footer for metadata or actions.

### 4. Typography
- A humanist sans for UI text, a warm serif for headlines/card titles, and
  monospace reserved for **structural labels** — Badge, section eyebrows,
  stamps, and the "retro terminal" readouts — the one place type itself carries
  the "structural bones" half of the identity.
- Mono labels are all‑caps with slightly increased tracking, styled like
  bespoke labels or archive stamps, never used for running prose.
- Line spacing is open and breathable elsewhere; hero headlines stay minimal
  and calm.

### 5. Shape language and containers
- **Zero radius, always.** `--radius-sm/md/lg` all resolve to `0px` — every
  card, button, input, and popover has a hard corner. This is the single
  biggest lever of the identity; it's a token change, not a per-component one.
- Borders are **2px ink** (`--border-width-bold`) on anything that reads as an
  object (card/button/input), 1px for plain dividers.
- Cards feel like thick stock: a bold ink border and a solid offset shadow
  (`--shadow-card`, no blur) give physical thickness instead of a flat
  drop-shadow.
- Windows/panels: a solid header bar, refined square controls, clear inner
  padding — desk‑organizer framing, not chrome.

### 6. Iconography and illustration
- Simple, refined line icons (1.5px weight), consistent geometry — unchanged
  from before; icon treatment isn't part of what this pass revisited.
- Decorative elements stay minimal: a stamp mark, a dotted accent — never
  competing with the grain or the shadow language for attention.

### 7. Buttons, controls, and states
- Fill: leather for primary, cardstock + ink border for default, oxblood
  outline for danger.
- Borders: 2px ink, zero radius, tall generous padding, short bold mono-caps
  labels on structural controls (Badge-style), plain sans labels on ordinary
  buttons.
- See §9 for what happens on hover/press — the motion *is* the "control state"
  language here, not a separate color treatment.

### 8. Surfaces, depth, and shadows
- Depth comes from structural outlines and solid, ink‑colored offset shadows —
  never blur. `--shadow-card` is the resting state; `--shadow-card-lifted` (a
  longer throw, same ink) is what a card's hover state reaches for — see §9.
- Grain: a tiled, grayscale SVG fractal-noise texture (`--texture-grain`, no
  image asset) at ~5% opacity with a multiply blend, applied to the page canvas
  (`global.css`'s `body::before`). Present at a glance, never a distraction —
  deliberately not layered onto every individual card as well, to keep it
  reading as ambient texture rather than noise.

### 9. Micro‑interactions and animation cues
Every animation has to answer one question: **what would this do if it were
really paper, ink, or wood?** Four physical answers cover the whole system —
not a library of easing curves:

- **Lift** — a card rises a couple of px and its shadow deepens
  (`--shadow-card` → `--shadow-card-lifted`) on hover, then settles back
  (`--ease-settle`) — picking something up, not "elevating a z-index."
  (`CardShell.css`)
- **Bleed** — a soft, blurred ink spread on hover instead of a flat color swap,
  on plain/danger buttons (not the solid-fill primary/pressed states, which
  have no paper underneath to spread into). (`Button.css`)
- **Strike** — primary actions compress and rotate a fraction on press, shadow
  flattening to zero, with a touch of overshoot on the way back up
  (`--ease-strike`) — a stamp striking down, not a button depressing.
  (`Button.css`)
- **Tint** — selection and highlight states use the highlighter material
  (`--color-selection-tint`), never the accent — marking content is a
  different act from choosing it. (`global.css`'s `::selection`,
  `AnnotatedText.css`'s `.selection-highlight`, `CardShell.css`'s
  `.card-shell--selected`)

All motion respects `prefers-reduced-motion: reduce` — transitions and the
grain's idle drift both drop out, the end states stay.
