import { Button, Icon, InputField } from "../../../primitives/index.js";
import type { PageCardWithCard } from "@wattle/shared";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { usePromptGeneration } from "../../../../hooks/usePromptGeneration.js";
import { t } from "../../../../i18n/index.js";
import "./PromptCard.css";

/**
 * The "prompt" CardType's actual content, shared by PromptCardView.tsx and
 * PromptCardEditor.tsx (nothing meaningfully differs between "selected" and
 * "selected + editing" here — same precedent as StackBody.tsx) — a text input, a
 * Send action, and (once there's something to show) the AI's response streamed in
 * directly below it, staying in *this* Card rather than creating a new sibling one
 * the way every other generation in the app does (see usePromptGeneration.ts).
 * Input writes straight through via cardStore.editCard on every keystroke, same
 * "no draft, no separate Save step" convention embeds/Dock Cards/the "action"
 * CardType's own calibration UI already use.
 */
export function PromptCardBody({ pageCard }: { pageCard: PageCardWithCard }) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const prompt = canonicalCard.metadata.prompt ?? { input: "", output: null };
  const generation = usePromptGeneration();

  function updateInput(input: string) {
    editCard(pageCard.card.id, { metadata: { ...canonicalCard.metadata, prompt: { ...prompt, input } } });
  }

  function handleSend() {
    const input = prompt.input.trim();
    if (input === "" || generation.streaming) return;
    generation.start(pageCard.id, input, (output) => {
      editCard(pageCard.card.id, { metadata: { ...canonicalCard.metadata, prompt: { ...prompt, output } } });
    });
  }

  const output = generation.streaming ? generation.text : (prompt.output ?? (generation.text || null));

  return (
    <div className="prompt-card">
      <InputField
        className="prompt-card__input"
        multiline
        value={prompt.input}
        placeholder={t("promptCard.inputPlaceholder")}
        onChange={(e) => updateInput(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="prompt-card__actions">
        {generation.streaming ? (
          <Button onClick={generation.stop}>
            <Icon name="stop" />
            {t("promptCard.stop")}
          </Button>
        ) : (
          <Button onClick={handleSend} disabled={prompt.input.trim() === ""}>
            <Icon name="generate" />
            {t("promptCard.send")}
          </Button>
        )}
      </div>
      {generation.error && <p className="prompt-card__error">{t("promptCard.errorPrefix")}{generation.error}</p>}
      {output && <div className="prompt-card__output">{output}</div>}
    </div>
  );
}
