import { InputField } from "../../../primitives/index.js";
import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./LinkCard.css";

/**
 * The "link" CardType's editor — a title input (Card.title, same convention every
 * other type uses) plus a URL field (metadata.link.url). Writes straight through via
 * cardStore.editCard on every change, same "no draft, no separate Save step"
 * convention ActionCardEditor.tsx already uses for its own special metadata field.
 */
export function LinkEditor({ pageCard }: CardTypeEditorProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const url = canonicalCard.metadata.link?.url ?? "";

  return (
    <div className="card-shell card-shell--editing card-shell--selected">
      <InputField
        className="card__title-input"
        value={canonicalCard.title}
        placeholder={t("card.titlePlaceholder")}
        autoFocus
        onChange={(e) => editCard(pageCard.card.id, { title: e.target.value })}
      />
      <InputField
        className="linkCard__url-input"
        value={url}
        placeholder={t("linkCard.urlPlaceholder")}
        onChange={(e) =>
          editCard(pageCard.card.id, {
            metadata: { ...canonicalCard.metadata, link: { url: e.target.value } },
          })
        }
      />
    </div>
  );
}
