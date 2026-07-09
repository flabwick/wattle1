import { useEffect, useState } from "react";
import type { PageCardWithCard } from "@wattle/shared";
import { Badge, Button, CardShell, InputField } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./Card.css";

interface CardProps {
  pageCard: PageCardWithCard;
  selected: boolean;
  onSelect: () => void;
  onChangeDraft: (draft: { title?: string; content?: string }) => void;
}

/**
 * A Card rendered inside a Page. Shows draft text if present, else the saved vault
 * copy. Editing happens inline, in place on the page: tapping Edit swaps this Card's
 * own body for a title input + textarea right where it sits, rather than opening a
 * separate editor in the Dock.
 */
export function CardView({ pageCard, selected, onSelect, onChangeDraft }: CardProps) {
  const [editing, setEditing] = useState(false);
  const title = pageCard.draftTitle ?? pageCard.card.title;
  const content = pageCard.draftContent ?? pageCard.card.content;
  const isDraft = pageCard.draftTitle !== null || pageCard.draftContent !== null;

  useEffect(() => {
    if (!selected) setEditing(false);
  }, [selected]);

  if (editing) {
    return (
      <div className="card-shell card-shell--editing card-shell--selected">
        <InputField
          className="card__title-input"
          value={title}
          placeholder={t("card.titlePlaceholder")}
          autoFocus
          onChange={(e) => onChangeDraft({ title: e.target.value })}
        />
        <InputField
          multiline
          className="card__content-input"
          value={content}
          placeholder={t("card.contentPlaceholder")}
          onChange={(e) => onChangeDraft({ content: e.target.value })}
        />
        <div className="card__row">
          <Button onClick={() => setEditing(false)}>{t("card.done")}</Button>
        </div>
      </div>
    );
  }

  return (
    <CardShell selected={selected} onClick={onSelect}>
      <div className="card__header">
        <span className="card__title">{title || t("common.untitled")}</span>
        <div className="card__header-actions">
          {isDraft && <Badge>{t("card.unsaved")}</Badge>}
          <Button
            onClick={(e) => {
              e.stopPropagation();
              if (!selected) onSelect();
              setEditing(true);
            }}
          >
            {t("card.action.edit")}
          </Button>
        </div>
      </div>
      <p className="card__preview">{content || t("card.emptyContent")}</p>
    </CardShell>
  );
}
