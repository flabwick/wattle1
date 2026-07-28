import { useRef, useState } from "react";
import type { Card } from "@wattle/shared";
import { Icon } from "../../../primitives/index.js";
import { CardRichText } from "../../richtext/CardRichText.js";
import type { CardRichTextHandle } from "../../richtext/CardRichText.js";
import { CardLinkPicker } from "../../CardLinkPicker.js";
import { t } from "../../../../i18n/index.js";
import "./EmbeddableTextField.css";

/** A plain WYSIWYG rich-text field — the same CardRichText every note's own content
 *  uses, not a bordered/boxed sub-widget — with "insert card link" folded into its
 *  own small label row instead of a separate toolbar strip above the text, so
 *  typing here feels like typing anywhere else in the app. Used by an inline
 *  actionButton node's ActionButtonConfigPopover.tsx (via ActionJobFields.tsx) —
 *  createCard's `content` and promptCard's `instructions` both need this: a hidden
 *  Card or any other Card, linked in as a normal `<wattle-embed>`, exactly like any
 *  note's own link button does (Card.tsx). */
export function EmbeddableTextField({
  cardId,
  label,
  value,
  onChange,
  placeholder,
}: {
  cardId: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const editorRef = useRef<CardRichTextHandle>(null);

  function insertCardLink(card: Card) {
    editorRef.current?.insertEmbed(card.id);
    setLinkPickerOpen(false);
  }

  return (
    <div className="action-card-editor__field">
      <div className="action-card-editor__field-label-row">
        <span className="action-card-editor__field-label">{label}</span>
        <div className="action-card-editor__link-btn-wrap">
          <button
            type="button"
            className="action-card-editor__link-btn"
            aria-label={t("card.insertLink")}
            title={t("card.insertLink")}
            onClick={() => setLinkPickerOpen((open) => !open)}
          >
            <Icon name="link" />
          </button>
          {linkPickerOpen && (
            <CardLinkPicker onSelect={insertCardLink} onClose={() => setLinkPickerOpen(false)} />
          )}
        </div>
      </div>
      <CardRichText
        ref={editorRef}
        content={value}
        onChangeContent={onChange}
        editable
        cardId={cardId}
        ancestorIds={new Set([cardId])}
        depth={0}
        placeholder={placeholder}
      />
    </div>
  );
}
