import { Button, CardShell, Icon } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { PromptCardBody } from "./PromptCardBody.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";

/** A tap toggles selection (App.tsx's toggleSelectPageCard) — in if not already
 *  selected, out again if it was; everything else (Edit, Save, Move, Hide, remove)
 *  is reached from the Dock. The input/Send/output inside (PromptCardBody) is
 *  independently always-interactive regardless of selection — same "content isn't
 *  gated behind edit mode" precedent StackBody.tsx uses. */
export function PromptCardView({ pageCard, selected, onSelect, onOpenFullscreen }: CardTypeViewProps) {
  return (
    <CardShell selected={selected} onClick={onSelect}>
      <div className="card__header">
        <div className="card__header-start">
          <span className="card__title">{t("promptCard.title")}</span>
        </div>
        <div className="card__header-actions">
          {onOpenFullscreen && (
            <Button
              iconOnly
              aria-label={t("card.openFullscreen")}
              title={t("card.openFullscreen")}
              onClick={(e) => {
                e.stopPropagation();
                onOpenFullscreen(pageCard.id);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Icon name="expand" />
            </Button>
          )}
        </div>
      </div>
      <PromptCardBody pageCard={pageCard} />
    </CardShell>
  );
}
