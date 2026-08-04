import { useState } from "react";
import { CardShell, Icon } from "../../../primitives/index.js";
import { CardRichText } from "../../richtext/CardRichText.js";
import { t } from "../../../../i18n/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import "../../Card.css";

/**
 * The "note" CardType's non-editing render — extracted from Card.tsx's static branch.
 * Not wired into Card.tsx yet (see the C0 doc): CardView still renders this same markup
 * inline today. This copy exists so cardTypeUiRegistry has a real entry for "note"
 * alongside the "link" stub, proving the registry pattern without touching the
 * behaviour users see.
 */
export function NoteView({ pageCard, selected, onSelect, onRequestEdit }: CardTypeViewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const title = pageCard.draftTitle ?? pageCard.card.title;
  const content = pageCard.draftContent ?? pageCard.card.content;

  return (
    <CardShell selected={selected} onSelect={onSelect} selectGesture="prose-aware" onDoubleClick={onRequestEdit}>
      <div className="card__header">
        <div className="card__header-start">
          <button
            type="button"
            className="card__caret-btn"
            aria-label={collapsed ? t("card.expand") : t("card.collapse")}
            title={collapsed ? t("card.expand") : t("card.collapse")}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Icon
              name="down"
              className={`card__caret${collapsed ? " card__caret--collapsed" : ""}`}
            />
          </button>
          {title && <span className="card__title">{title}</span>}
        </div>
      </div>
      {!collapsed && (
        <CardRichText
          content={content}
          onChangeContent={() => {}}
          editable={false}
          cardId={pageCard.card.id}
          ancestorIds={new Set([pageCard.card.id])}
          depth={0}
        />
      )}
    </CardShell>
  );
}
