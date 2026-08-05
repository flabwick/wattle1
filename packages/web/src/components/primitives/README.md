# Primitives

Small, purely token-driven building blocks — every visual property (spacing, color,
border width, shadow, radius, type, touch-target size) comes from `../../styles/tokens.css`,
never a new hardcoded value. Components compose these instead of writing their own
bespoke box-model CSS, mirroring the pattern in
[`packages/shared/src/registries/README.md`](../../../../shared/src/registries/README.md)
(a small shared vocabulary, referenced everywhere, edited in one place).

`tokens.css`'s color/border/shadow/type/motion values implement
[docs/styling.md](../../../../../docs/styling.md) ("Paper & Wood Brutalism") — a
material-based palette (`--material-*`, each `--color-*` role a `var()` onto one),
zero corner radius throughout, and four physical motion cues (lift/bleed/strike/
tint) instead of a generic easing-curve library. The short version: bold ink
borders, solid offset shadows (no blur), a cardstock/leather/oak palette, and a
humanist-sans/warm-serif/mono type trio, all expressed as tokens so `styling.md`'s
rules only need encoding once.

## What's here

| Primitive | For | Variants / props |
|---|---|---|
| `Button` | Any clickable action | `variant`: `"default"` (bordered, surface fill) / `"primary"` (leather fill) / `"danger"` (oxblood text). `iconOnly` squares it up to `--touch-target-min`/`--touch-target-sm` instead of text padding (Step 5). |
| `CardShell` | A tappable card-like container | `selected` (accent border + accent-colored shadow). A `<div role="button">`, not a real `<button>` (Step 5 — Card.tsx nests real buttons/gesture handlers inside it, and a `<button>` can't legally nest another). |
| `Badge` | A small inline label ("archive stamp": bordered, uppercase, mono) | — |
| `InputField` | A text input or textarea | `multiline` switches `<input>` → `<textarea>` |
| `Icon` | A line icon in place of a text label (Step 5) | `name`: one of the fixed set in `Icon.tsx` (`edit`, `generate`, `remove`, `delete`, `done`, `plus`, `file`, `vault`, `close`, `search`, `up`, `down`, `folder`, `chevronRight`, ...) — add a new one there, don't inline an `<svg>` at a call site. `spin` for the in-progress generate icon. |
| `Overlay` | A centered modal (backdrop + card-like box) | Escape/outside-press both close it, via `useDismiss`. `className` extends `.overlay__box` for per-instance sizing/background (AnnotationDetail, SaveAsAppModal, AppBrowser). Doesn't portal itself — wrap the caller's own `createPortal` around it when needed. |
| `PopoverSurface` | The box shell an anchored popover renders its content in | Forwards its ref (hand it straight to `useDismiss`). Deliberately doesn't set `position`/`z-index`/`flex-direction` — those stay in the caller's own class, since they vary per popover (CardLinkPicker, ConvertPicker, ProcessPicker, DiffPopover, SelectionMenu, the ActionNode popovers, ...). |
| `PopoverItem` | One row in a popover's list/menu | `variant`: `"list"` (full-width, no divider — CardLinkPicker/ContextCardPicker) / `"menu"` (compact, border-bottom dividers — ConvertPicker/ProcessPicker). `icon` renders an `Icon` at the row's leading edge. |
| `PopoverSearch` | The search-as-you-type header a popover list opens with | A leading search icon over an `InputField` — passes every prop straight through (CardLinkPicker, ContextCardPicker). |

Each ships its own `.css` file (e.g. `Button.tsx` / `Button.css`) — same one-file-per-
component convention as everywhere else in `packages/web/src/components/`. `Overlay`
and `Popover` build on `hooks/useDismiss.ts` — the app's one outside-press/Escape
dismiss convention, previously duplicated near-verbatim across every anchored popover
and inline edit-mode boundary (CardEmbed.tsx's/Card.tsx's own click-outside-to-close
for inline editing included).

## Why this exists

Before Step 3, `Dock.tsx`, `Card.tsx`, `VaultView.tsx`, and `PageStack.tsx` each hand-
rolled their own button/input/card CSS with the same tokens repeated four times. Any
tokens.css change (say, a new radius scale) meant hunting down every duplicate. Primitives
put each *kind* of visual element in one place: change `Button.css` once, every button
using it updates.

`Card.tsx` and `Dock.tsx` were refactored in Step 3 to compose `CardShell`/`Badge` and
`Button`/`InputField` respectively; `VaultView.tsx` and `PageStack.tsx` followed in Step
4 (their raw `<button>`/`<input>` elements now compose `Button`/`InputField` too). Each
component's own `.css` file is slimmed to only the layout rules specific to it — e.g.
`Dock.css` keeps `.dock__row`'s flex layout but no longer duplicates button box-styling,
since `Button.css` owns that now.

Step 5 replaced every visible text label app-wide with an `Icon` (see
[docs/step5-dock-driven-interaction.md](../../../../../docs/step5-dock-driven-interaction.md)
§2) and reworked navigation enough that the one deliberate hand-rolled exception noted
here previously (`PageStack.css`'s dashed "+ New Page" button) no longer exists — Page
creation is now a `Button`/`Icon` in `components/PageNav/PageNav.tsx` like everything
else. There is no bespoke, non-primitive button left in the app as of Step 5.

## Adding a new primitive

1. Create `<Name>.tsx` + `<Name>.css` in this folder. Style purely from `tokens.css`
   variables — if you need a value tokens.css doesn't have, add the token there first
   (spacing/color/border/shadow/radius/type scale), don't hardcode a pixel value in the
   primitive.
2. Export it from `index.ts`.
3. Import it in whatever component needs it: `import { Name } from "../primitives/index.js"`.
4. If an existing component has bespoke CSS that duplicates what the new primitive now
   owns, slim that component's `.css` file the same way `Dock.css`, `Card.css`,
   `VaultView.css`, and `PageStack.css` were slimmed — don't leave two copies of the
   same box-model rules.
