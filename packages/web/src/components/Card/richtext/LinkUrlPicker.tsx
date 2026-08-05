import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Button, InputField } from "../../primitives/index.js";
import { useDismiss } from "../../../hooks/useDismiss.js";
import { t } from "../../../i18n/index.js";
import "./ActionNodes.css";

interface LinkUrlPickerProps {
  /** The selection's current link URL, if the toolbar button was clicked while the
   *  cursor already sat on a link (Dock.tsx's formattingState.linkHref) — prefills
   *  the field for editing instead of starting blank. */
  initialUrl: string;
  onSubmit: (url: string) => void;
  /** Only present when the selection is already a link — lets this same popover
   *  clear it instead of requiring a separate toolbar button just for that. */
  onRemove?: () => void;
  onClose: () => void;
  /** Same fixed-position-from-trigger-rect convention as ActionFieldKindPicker.tsx —
   *  see its own doc comment for why this can't be a CSS-anchored popover. */
  style: CSSProperties;
  excludeSelector: string;
}

/** The Dock's "insert link" formatting action opens this instead of setting a mark
 *  directly — a plain URL text field, since (unlike "insert card link"'s
 *  CardLinkPicker) there's no list of candidates to pick from. Same outside-click/
 *  Escape-to-close convention as ActionFieldKindPicker.tsx. */
export function LinkUrlPicker({ initialUrl, onSubmit, onRemove, onClose, style, excludeSelector }: LinkUrlPickerProps) {
  const [url, setUrl] = useState(initialUrl);
  const rootRef = useDismiss<HTMLFormElement>(onClose, { excludeSelector });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed === "") return;
    onSubmit(trimmed);
  }

  return (
    <form
      ref={rootRef}
      className="popover-surface action-field-kind-picker link-url-picker"
      style={style}
      onSubmit={handleSubmit}
    >
      <InputField
        className="link-url-picker__input"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t("card.hyperlinkPlaceholder")}
        autoFocus
      />
      <div className="link-url-picker__actions">
        {onRemove && (
          <Button type="button" onClick={onRemove}>
            {t("card.hyperlinkRemove")}
          </Button>
        )}
        <Button type="submit" variant="primary">
          {t("card.hyperlinkApply")}
        </Button>
      </div>
    </form>
  );
}
