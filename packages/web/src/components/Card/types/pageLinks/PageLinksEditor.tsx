import { useState } from "react";
import { Button, Icon, InputField } from "../../../primitives/index.js";
import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { PageLinkPicker } from "../../PageLinkPicker.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./PageLinksCard.css";

/**
 * The "pageLinks" CardType's editor — a title input (Card.title, same convention
 * every other type uses) plus the target list itself: each row removable, an "Add
 * link" button opening the same PageLinkPicker the rich-text editor's own "insert
 * Page link" toolbar action uses (search existing Pages, or create-on-missing).
 * Writes straight through via cardStore.editCard on every change, same "no draft, no
 * separate Save step" convention LinkEditor.tsx uses for its own single extra field.
 */
export function PageLinksEditor({ pageCard }: CardTypeEditorProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const targets = canonicalCard.metadata.pageLinks?.targets ?? [];
  const [pickerOpen, setPickerOpen] = useState(false);

  function setTargets(next: { pageId: string; title: string }[]) {
    editCard(pageCard.card.id, {
      metadata: { ...canonicalCard.metadata, pageLinks: { targets: next } },
    });
  }

  return (
    <div className="card-shell card-shell--editing card-shell--selected">
      <InputField
        className="card__title-input"
        value={canonicalCard.title}
        placeholder={t("card.titlePlaceholder")}
        autoFocus
        onChange={(e) => editCard(pageCard.card.id, { title: e.target.value })}
      />
      <ul className="pageLinksCard__list pageLinksCard__list--editing">
        {targets.map((target) => (
          <li key={target.pageId}>
            <span className="pageLinksCard__target">
              <Icon name="pages" />
              {target.title}
            </span>
            <Button
              iconOnly
              aria-label={t("pageLinksCard.remove")}
              title={t("pageLinksCard.remove")}
              onClick={() => setTargets(targets.filter((t2) => t2.pageId !== target.pageId))}
            >
              <Icon name="close" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="pageLinksCard__add-wrap">
        <Button onClick={() => setPickerOpen((open) => !open)}>
          <Icon name="plus" />
          {t("pageLinksCard.addLink")}
        </Button>
        {pickerOpen && (
          <PageLinkPicker
            parentPageId={pageCard.pageId}
            onSelect={(page) => {
              if (!targets.some((t2) => t2.pageId === page.id)) {
                setTargets([...targets, { pageId: page.id, title: page.title ?? "" }]);
              }
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
