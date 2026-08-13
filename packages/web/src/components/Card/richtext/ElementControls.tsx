import { Button, Icon } from "../../primitives/index.js";

interface ElementControlsProps {
  onDelete: () => void;
  /** Accessible name/tooltip — always specific to the element ("Delete callout",
   *  "Delete math") rather than a generic "Delete", since several of these can sit
   *  side by side in one Card. */
  label: string;
  /** "corner" for elements with their own box to hang off (callout, action button/
   *  field, table, image) — absolutely positioned, floating slightly outside the
   *  top-right edge. "inline" for elements that sit inline in running text (math,
   *  Page link chip) — a plain flex sibling instead, so it doesn't overlap text. */
  variant: "corner" | "inline";
}

/**
 * The one delete affordance every inline rich-text element (callout, math, action
 * button/field, Page link, table, image) now shares — same icon/button language as
 * CardHeaderActions' own remove button, scaled down. Exists because several of these
 * elements' own click handler already does something else (edit, navigate, run),
 * which swallows the click ProseMirror would otherwise need to select-then-backspace
 * them — this gives every element an explicit, identical way to be removed instead
 * of relying on that per-type accident. Callers gate rendering on
 * `useCardEditingContext().editable` themselves, same as the config popovers these
 * sit alongside.
 */
export function ElementControls({ onDelete, label, variant }: ElementControlsProps) {
  return (
    <Button
      iconOnly
      className={`element-controls element-controls--${variant}`}
      aria-label={label}
      title={label}
      contentEditable={false}
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <Icon name="delete" />
    </Button>
  );
}
