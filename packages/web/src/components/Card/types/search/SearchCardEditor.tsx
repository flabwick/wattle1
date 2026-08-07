import { InputField } from "../../../primitives/index.js";
import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { SearchCardBody } from "./SearchCardBody.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";

/** Only the title differs from SearchCardView — the search box/results themselves
 *  (SearchCardBody) are identically interactive in both, same precedent as
 *  LinkEditor.tsx's own title-input-plus-shared-field split. `onChangeDraft` is
 *  unused: there's no title draft here, edits write straight through. */
export function SearchCardEditor({ pageCard }: CardTypeEditorProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;

  return (
    <div className="card-shell card-shell--editing card-shell--selected">
      <InputField
        className="card__title-input"
        value={canonicalCard.title}
        placeholder={t("card.titlePlaceholder")}
        autoFocus
        onChange={(e) => editCard(pageCard.card.id, { title: e.target.value })}
      />
      <SearchCardBody pageCard={pageCard} />
    </div>
  );
}
