import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import { PromptCardBody } from "./PromptCardBody.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";

/** Nothing actually differs between a Prompt Card "selected" vs. "selected +
 *  editing" (see PromptCardBody.tsx's doc comment) — this only exists because
 *  cardTypeUiRegistry.register requires an Editor for every type (same reasoning
 *  as StackEditor.tsx/FileEditor.tsx). `onChangeDraft` is unused: there's no
 *  title/content draft here, input writes straight through. */
export function PromptCardEditor({ pageCard }: CardTypeEditorProps) {
  return (
    <div className="card-shell card-shell--selected">
      <div className="card__header">
        <div className="card__header-start">
          <span className="card__title">{t("promptCard.title")}</span>
        </div>
      </div>
      <PromptCardBody pageCard={pageCard} />
    </div>
  );
}
