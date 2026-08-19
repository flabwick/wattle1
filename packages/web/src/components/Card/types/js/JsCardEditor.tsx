import { useState } from "react";
import { Button, Icon, InputField } from "../../../primitives/index.js";
import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { generateJsCardSource } from "../../../../lib/wattleJsJob.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./JsCard.css";

/** The "js" CardType's own edit face — a plain code editor for
 *  `metadata.js.source`, writing straight through via `editCard` on every
 *  keystroke (no draft/Save step, same convention SearchCardEditor.tsx already
 *  uses for its own single-purpose data), plus a "Describe what this card
 *  should do" box that calls the model and replaces the whole script. Reached
 *  by double-clicking the live JsCardView the normal way. */
export function JsCardEditor({ pageCard }: CardTypeEditorProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const source = canonicalCard.metadata.js?.source ?? "";
  const [instruction, setInstruction] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  function setSource(next: string) {
    editCard(pageCard.card.id, { metadata: { ...canonicalCard.metadata, js: { source: next } } });
  }

  async function handleGenerate() {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const next = await generateJsCardSource(trimmed, source);
      setSource(next);
      setInstruction("");
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
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
      <div className="js-card__generate">
        <InputField
          className="js-card__generate-input"
          value={instruction}
          placeholder={t("jsCard.generatePlaceholder")}
          disabled={generating}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleGenerate();
            }
          }}
        />
        <Button disabled={generating || !instruction.trim()} onClick={() => void handleGenerate()}>
          <Icon name="generate" spin={generating} />
          {t("jsCard.generateButton")}
        </Button>
      </div>
      {generateError && <p className="js-card__generate-error">{generateError}</p>}
      <InputField
        multiline
        className="js-card__editor"
        value={source}
        placeholder={t("jsCard.sourcePlaceholder")}
        onChange={(e) => setSource(e.target.value)}
      />
    </div>
  );
}
