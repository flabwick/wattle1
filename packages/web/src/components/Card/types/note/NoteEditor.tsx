import { Icon, InputField } from "../../../primitives/index.js";
import { t } from "../../../../i18n/index.js";
import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import "../../Card.css";

/**
 * The "note" CardType's inline editor — extracted from Card.tsx's editing branch. Not
 * wired into Card.tsx yet; see NoteView.tsx for why.
 */
export function NoteEditor({ pageCard, onChangeDraft }: CardTypeEditorProps) {
  const title = pageCard.draftTitle ?? pageCard.card.title;
  const content = pageCard.draftContent ?? pageCard.card.content;

  return (
    <div className="card-shell card-shell--editing card-shell--selected">
      <div className="card__header">
        <div className="card__header-start">
          <span className="card__caret-btn card__caret-btn--static" aria-hidden="true">
            <Icon name="down" className="card__caret" />
          </span>
          <InputField
            className="card__title-input"
            value={title}
            placeholder={t("card.titlePlaceholder")}
            autoFocus
            onChange={(e) => onChangeDraft({ title: e.target.value })}
          />
        </div>
      </div>
      <InputField
        multiline
        className="card__content-input"
        value={content}
        placeholder={t("card.contentPlaceholder")}
        onChange={(e) => onChangeDraft({ content: e.target.value })}
      />
    </div>
  );
}
