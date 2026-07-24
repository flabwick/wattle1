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
  | "folder"
  | "chevronRight"
  | "annotate"
  | "diff"
  | "footnote"
  | "highlight"
  | "stop"
  | "more"
  | "tray"
  | "pages"
  | "tabs"
  | "stackAdd"
  | "back"
  | "save"
  | "bold"
  | "italic"
  | "heading"
  | "bulletList"
  | "orderedList";

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
  // A folder tab — distinct from "vault" (the Dock's whole-panel toggle) even though
  // both read as container shapes; this one marks individual Folder rows/breadcrumbs.
  folder: <path d="M4 6h6l2 2h8v11H4V6z" />,
  // A single right-pointing chevron — the explicit "open this Folder" row control,
  // since a Folder row's own click now only selects it (see VaultView.tsx).
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
  // Browser-style tabs — the Tabs panel's toggle (Step 6 spec §3.4), distinct from
  // "pages" (that Tab's own vertical stack).
  tabs: (
    <>
      <path d="M3 8h6l2 3h10" />
      <path d="M3 8v11h18V11h-8l-2-3H3z" />
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
