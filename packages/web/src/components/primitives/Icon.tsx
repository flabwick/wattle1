import "./Icon.css";

/**
 * The app's whole icon vocabulary — one name per action that used to be a text label.
 * Add a new one here (and to the map below) rather than inlining an <svg> at a call
 * site, so every icon shares the same viewBox/stroke geometry (styling.md §6:
 * "consistent geometry" across icons).
 */
export type IconName =
  | "edit"
  | "generate"
  | "remove"
  | "delete"
  | "done"
  | "plus"
  | "file"
  | "vault"
  | "close"
  | "search"
  | "up"
  | "down"
  | "upload"
  | "link"
  | "move"
  | "chevronRight"
  | "annotate"
  | "diff"
  | "footnote"
  | "highlight"
  | "stop"
  | "more"
  | "tray"
  | "pages"
  | "stackAdd"
  | "home"
  | "pin"
  | "back"
  | "save"
  | "bookmark"
  | "bold"
  | "italic"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "eye"
  | "templates"
  | "insertButton"
  | "insertTextbox"
  | "settings"
  | "expand"
  | "strikethrough"
  | "underline"
  | "blockquote"
  | "horizontalRule"
  | "codeBlock"
  | "externalLink"
  | "taskList"
  | "table"
  | "tableInsertRow"
  | "tableInsertColumn"
  | "image"
  | "callout"
  | "math"
  | "eyeOff"
  | "copy"
  | "convert"
  | "lock"
  | "compass"
  | "info"
  | "undo"
  | "redo"
  | "moreVertical"
  | "versionBack"
  | "versionForward";

interface IconProps {
  name: IconName;
  className?: string;
  spin?: boolean;
}

const PATHS: Record<IconName, JSX.Element> = {
  edit: (
    <>
      <path d="M4 20h4L18.5 9.5a2.121 2.121 0 0 0-3-3L5 17v3z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  generate: (
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </>
  ),
  remove: (
    <>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 8l-4 4 4 4" />
      <path d="M11 12h9" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  done: <path d="M4 12l5 5L20 6" />,
  plus: (
    <>
      <path d="M12 4v16" />
      <path d="M4 12h16" />
    </>
  ),
  file: (
    <>
      <path d="M7 3h7l4 4v14H7V3z" />
      <path d="M14 3v4h4" />
    </>
  ),
  vault: (
    <>
      <path d="M4 7h16v13H4z" />
      <path d="M4 7l2-4h12l2 4" />
      <path d="M10 11h4" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </>
  ),
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  link: (
    <>
      <path d="M9 15l6-6" />
      <path d="M8 13l-2.5 2.5a3.5 3.5 0 0 0 5 5L13 18" />
      <path d="M16 11l2.5-2.5a3.5 3.5 0 0 0-5-5L11 6" />
    </>
  ),
  move: (
    <>
      <path d="M12 3v18" />
      <path d="M9 6l3-3 3 3" />
      <path d="M9 18l3 3 3-3" />
      <path d="M3 12h18" />
      <path d="M6 9l-3 3 3 3" />
      <path d="M18 9l3 3-3 3" />
    </>
  ),
  // A small comment/callout bubble — the Dock's "run a process" action and the
  // text-selection context menu both use this as their trigger icon; the three
  // process-specific icons below (diff/footnote/highlight) label the picker's own
  // choices once that menu is open.
  annotate: (
    <>
      <path d="M4 5h16v11H8l-4 4V5z" />
      <path d="M8 10h8" />
    </>
  ),
  diff: (
    <>
      <path d="M5 7h9" />
      <path d="M5 12h6" />
      <path d="M16 15l3 3 3-3" />
      <path d="M19 4v14" />
    </>
  ),
  footnote: (
    <>
      <path d="M4 6h16" />
      <path d="M4 11h10" />
      <path d="M4 16h7" />
      <circle cx="19" cy="16" r="3" />
      <path d="M18 15.2h2" />
    </>
  ),
  highlight: (
    <>
      <path d="M7.5 15.5L4 19v-3.5L14 5l4 4-10 10z" />
      <path d="M13 6.5l4 4" />
      <path d="M4 19h4" />
    </>
  ),
  // A filled square — the Dock's Generate action becomes this while a generation is
  // streaming, standard "stop" glyph so it reads as distinct from close/cancel (X).
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  // A single right-pointing chevron — reused as "Forward" in the Dock's recent-Pages
  // nav cluster (App.tsx's pageHistory).
  chevronRight: <path d="M9 5l7 7-7 7" />,
  // Three dots — the Feed Input Button's "expand" trigger (Step 6 spec §2.2).
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  // An inbox tray — the Dock Cards scratchpad's own toggle/"Move to Dock" icon,
  // distinct from "vault" (a different, page-oriented destination).
  tray: (
    <>
      <path d="M4 13l3-8h10l3 8" />
      <path d="M4 13v6h16v-6" />
      <path d="M4 13h5l1.5 2h3L15 13h5" />
    </>
  ),
  // Stacked sheets — the Pages panel's toggle (Step 6 spec §3.5), distinct from
  // "file"/"folder" (vault-oriented) and "tray" (the Dock scratchpad).
  pages: (
    <>
      <path d="M7 4h8l4 4v12H7V4z" />
      <path d="M5 8v13h11" />
    </>
  ),
  // A simple house — Home (Pages + Links + Search rebuild, Phase 4), the one fixed
  // destination every Page can navigate back to.
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  // A classic map-pin drop — the scarce pin rail's toggle (Phase 4), distinct from
  // "bookmark" (that glyph means "save this Card to the vault", not "pin this Page").
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  // Two offset card outlines with a plus badge — the Dock's "Make a Stack" action
  // (turns the single selected Card into a Stack containing it), distinct from
  // "tabs"/"pages" (panel toggles, not an action on the current selection).
  stackAdd: (
    <>
      <path d="M3 3h10v10H3z" />
      <path d="M7 7h10v10H7z" />
      <path d="M18 15v6" />
      <path d="M15 18h6" />
    </>
  ),
  // A left-pointing chevron — mirrors "chevronRight"; the Dock Card panel's own
  // "back" control while editing (there's no page-level Back Card action).
  back: <path d="M15 5l-7 7 7 7" />,
  // A floppy disk — the classic "save" glyph, only ever shown while there's an
  // actual unsaved draft to commit (Dock.tsx's selectedCards branch); it isn't
  // repurposed as a disabled/done indicator once saved the way "plus"/"done" used
  // to be — the action just disappears from the row entirely instead.
  save: (
    <>
      <path d="M5 4h11l3 3v13H5V4z" />
      <path d="M8 4v5h7V4" />
      <path d="M8 14h8v5H8v-5z" />
    </>
  ),
  // The classic ribbon/bookmark glyph (a rectangle notched at the bottom) most
  // social apps use for "save this" — Card.tsx's own header Save button, shown
  // while there's something not yet in the vault; swaps to "done" once it is
  // (see that button's own doc comment).
  bookmark: <path d="M6 4h12v16l-6-4.5L6 20V4z" />,
  // Standard "B" glyph — the Dock formatting toolbar's bold toggle.
  bold: (
    <path d="M7 4h6a3.5 3.5 0 0 1 0 7H7V4z M7 11h7a3.5 3.5 0 0 1 0 7H7v-7z" />
  ),
  // Standard "I" glyph — the Dock formatting toolbar's italic toggle.
  italic: (
    <>
      <path d="M11 4h6" />
      <path d="M7 20h6" />
      <path d="M14 4L10 20" />
    </>
  ),
  // A large "H" with a baseline rule — the Dock formatting toolbar's heading toggle,
  // distinct from plain bold/italic by the underline suggesting block-level structure.
  heading: (
    <>
      <path d="M6 4v16" />
      <path d="M16 4v16" />
      <path d="M6 12h10" />
      <path d="M4 20h4" />
      <path d="M14 20h4" />
    </>
  ),
  // Three dots with rules — the Dock formatting toolbar's bullet-list toggle.
  bulletList: (
    <>
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
    </>
  ),
  // Numeral marks ("1", "2") with rules — the Dock formatting toolbar's ordered-list
  // toggle, distinct from "bulletList" by the digit marks in place of dots.
  orderedList: (
    <>
      <path d="M3.5 7l1-1v4" />
      <path d="M3.3 16.5c0-1 .8-1.5 1.4-1.5s1.3.5 1.3 1.3-.9 1.3-2.3 2.7h2.3" />
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
    </>
  ),
  // A standard open-eye glyph — the Dock's "reveal hidden cards" toggle (Apps
  // feature spec §2), distinct from every other icon here by shape alone since
  // nothing else in the vocabulary is about visibility.
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // Same open-eye glyph plus a diagonal slash — the Dock's "Hide" action
  // (selectedCards row), distinct from "eye" (that toggle *reveals* already-hidden
  // Cards; this one *sets* metadata.hidden on the current selection).
  eyeOff: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </>
  ),
  // Four squares — the classic "app launcher" glyph, distinct from every existing
  // container-shaped icon here (vault/tray/folder) since Templates aren't a storage
  // destination. Not currently wired to any call site — reserved for a future
  // "New from Template…" entry point and/or TemplateBrowser.tsx's own use.
  templates: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  // A rounded rectangle with a short center line — inserting an inline action
  // button into a Card's rich content, distinct from "plus" (adding a whole new
  // Card/Page).
  insertButton: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="2.5" />
      <path d="M9 12h6" />
    </>
  ),
  // A rectangle with a blinking-cursor bar — inserting an inline text-box
  // placeholder, distinct from "insertButton" by the cursor mark instead of a line.
  insertTextbox: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M8 10v4" />
    </>
  ),
  // A gear — an actionField's own "calibrate this field" toggle (min/max/options/
  // etc., ActionFieldConfigPopover.tsx), distinct from the field's own control,
  // which stays devoted to entering its actual value.
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M4.2 7.8l2.6 1.5M17.2 14.7l2.6 1.5M4.2 16.2l2.6-1.5M17.2 9.3l2.6-1.5M3 12h3M18 12h3" />
    </>
  ),
  // Four corner brackets — the standard "expand to fullscreen" glyph, distinct from
  // "eye" (visibility toggle, not a navigation action): every Card's own "open in
  // fullscreen" corner button (Card.tsx/StackBody.tsx).
  expand: (
    <>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </>
  ),
  // An abstract "S" with a strike line through it — the Dock formatting toolbar's
  // strikethrough toggle, same "abstract letterform" convention as bold/italic.
  strikethrough: (
    <>
      <path d="M4 12h16" />
      <path d="M8 7c1-1.5 2.5-2 4-2 2 0 4 1 4 2.5" />
      <path d="M8 17c1 1.5 2.5 2 4 2 2 0 4-1 4-2.5" />
    </>
  ),
  // A "U" with a baseline rule — the Dock formatting toolbar's underline toggle,
  // same shape logic as "heading" (letterform + rule).
  underline: (
    <>
      <path d="M6 4v8a6 6 0 0 0 12 0V4" />
      <path d="M4 20h16" />
    </>
  ),
  // Two comma-shaped quote marks — the Dock formatting toolbar's blockquote toggle.
  blockquote: (
    <>
      <path d="M7 7c-1.5 0-3 1.2-3 3.5S5.5 14 7 14c0 2-1 3-3 3" />
      <path d="M17 7c-1.5 0-3 1.2-3 3.5S15.5 14 17 14c0 2-1 3-3 3" />
    </>
  ),
  // A bold rule with end ticks — the Dock formatting toolbar's "insert horizontal
  // rule" action, distinct from a plain strike/underline line by the ticks marking
  // it as its own block-level divider rather than a mark on text.
  horizontalRule: (
    <>
      <path d="M4 12h16" />
      <path d="M4 9v6" />
      <path d="M20 9v6" />
    </>
  ),
  // The classic "</>" glyph — the Dock formatting toolbar's code-block toggle,
  // distinct from every letterform-based icon above by shape alone.
  codeBlock: (
    <>
      <path d="M8 6l-5 6 5 6" />
      <path d="M16 6l5 6-5 6" />
    </>
  ),
  // A box with an arrow breaking out its top-right corner — the standard "external
  // link" glyph, distinct from "link" (the chain icon used for Wattle's own
  // card-embed insert) since this instead sets a plain `<a href>` mark on text.
  externalLink: (
    <>
      <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
      <path d="M14 4h6v6" />
      <path d="M20 4L10 14" />
    </>
  ),
  // A checked checkbox with a rule — the Dock formatting toolbar's task-list
  // toggle, same "mark + rule" shape as bulletList/orderedList above.
  taskList: (
    <>
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="M4.5 8l1 1 2-2" />
      <path d="M12 8h9" />
      <rect x="3" y="14" width="6" height="6" rx="1" />
      <path d="M12 17h9" />
    </>
  ),
  // A grid — the Dock formatting toolbar's "insert table" action.
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 10h18" />
      <path d="M3 16h18" />
      <path d="M11 4v16" />
    </>
  ),
  // Two rows plus a "+" beneath — the table toolbar's own "add row" action, shown
  // only while the cursor sits inside a table (Dock.tsx's formatToolActions).
  tableInsertRow: (
    <>
      <path d="M4 8h16" />
      <path d="M4 14h16" />
      <path d="M12 18v4" />
      <path d="M10 20h4" />
    </>
  ),
  // Two columns plus a "+" beside — the table toolbar's own "add column" action,
  // same gating as tableInsertRow above.
  tableInsertColumn: (
    <>
      <path d="M8 4v16" />
      <path d="M14 4v16" />
      <path d="M18 12h4" />
      <path d="M20 10v4" />
    </>
  ),
  // A framed landscape glyph (mountain + sun) — the Dock formatting toolbar's
  // "insert image" action, standard image-placeholder iconography.
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M3 17l5.5-5.5a2 2 0 0 1 2.8 0L17 17" />
      <path d="M14 14l1.5-1.5a2 2 0 0 1 2.8 0L21 15.5" />
    </>
  ),
  // A speech-bubble variant with an exclamation mark — the Dock formatting
  // toolbar's "insert callout" action, distinct from "annotate" (a plain
  // rectangular comment bubble) by the rounded shape and interior mark.
  callout: (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 4V6z" />
      <path d="M12 7v5" />
      <circle cx="12" cy="15" r="0.2" fill="currentColor" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  // A square-root glyph — the Dock formatting toolbar's "insert math" action.
  math: (
    <>
      <path d="M4 14l3 3 4-9" />
      <path d="M11 8h9" />
    </>
  ),
  // Two overlapping rectangles — the classic "copy" glyph, used by SelectionMenu.tsx/
  // CardRichText.tsx's own "copy to clipboard" action for a highlighted selection or
  // an existing Quote.
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  // An arrow feeding into a document — the Dock's "Convert" action
  // (selectedCards/quote rows). Reuses "file"'s own document shape (shifted
  // right to make room for the arrow) so "converting into a Standard Wattle
  // Card" reads unambiguously — replaces an earlier circular-arrows/sync glyph
  // (Card design pass) that read as "refresh", not "convert".
  convert: (
    <>
      <path d="M11 3h6l4 4v14H11V3z" />
      <path d="M17 3v4h4" />
      <path d="M2 12h7" />
      <path d="M6 9l3 3-3 3" />
    </>
  ),
  // A padlock — the Dock's "Freeze" action (selectedCards row) and a Frozen Card's
  // own header badge (Card.tsx), distinct from every other icon here as the one
  // read-only/state glyph rather than an action-in-motion shape.
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  // A compass needle — the Nearby panel's own toggle (Wattle vault plan), distinct
  // from "search" (an explicit query) since Nearby is an ambient, situational
  // ranking rather than something the user typed a query for.
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-2 6-4-2z" fill="currentColor" stroke="none" />
    </>
  ),
  // A circled "i" — the standard info glyph; a Card's own "flip to properties"
  // header button (Card.tsx), distinct from "settings" (a gear, for configuring
  // something) since this just discloses read-only facts about the Card itself.
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="8" r="0.2" fill="currentColor" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v6" />
    </>
  ),
  // A counter-clockwise curling arrow — the idle Dock row's Undo stub.
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  // Redo, the mirror of "undo" above.
  redo: (
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </>
  ),
  // A double chevron, pointing left — the full state system's generation-version
  // Back, deliberately distinct from the single-chevron "back"/"chevronRight" pair
  // above (the Dock's *Page*-navigation back/forward) so the two don't read as the
  // same control over two different things.
  versionBack: (
    <>
      <path d="M18 5l-7 7 7 7" />
      <path d="M11 5l-7 7 7 7" />
    </>
  ),
  // Version Forward, the mirror of "versionBack" above.
  versionForward: (
    <>
      <path d="M6 5l7 7-7 7" />
      <path d="M13 5l7 7-7 7" />
    </>
  ),
  // Three vertically-stacked dots — distinct from "more" (horizontal, the Feed Input
  // Button's own trigger) so the two don't read as the same control in different
  // spots. The idle Dock row's own "more" stub.
  moreVertical: (
    <>
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
};

/**
 * A line icon, styled purely from tokens.css (`--icon-size`/`--icon-stroke-width`) —
 * styling.md §6's "simple, refined line icons" in place of the text labels Step 1-4
 * used. Always `aria-hidden`: the button/element it sits in carries the accessible
 * name (`aria-label`), since the visible label is gone.
 */
export function Icon({ name, className, spin }: IconProps) {
  const classes = `icon${spin ? " icon--spin" : ""}${className ? ` ${className}` : ""}`;
  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
