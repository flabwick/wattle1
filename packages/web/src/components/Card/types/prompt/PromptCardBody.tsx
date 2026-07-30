import { useEffect, useRef, useState } from "react";
import type { PageCardWithCard, PromptCardContextMode } from "@wattle/shared";
import { Button, Icon, InputField } from "../../../primitives/index.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard, getCachedCard } from "../../../../lib/cardStore.js";
import { usePromptGeneration } from "../../../../hooks/usePromptGeneration.js";
import { CardRichText } from "../../richtext/CardRichText.js";
import { ContextCardPicker } from "./ContextCardPicker.js";
import { t } from "../../../../i18n/index.js";
import "./PromptCard.css";

const EMPTY_ANCESTOR_IDS: ReadonlySet<string> = new Set();
const CONTEXT_MODES: readonly PromptCardContextMode[] = ["none", "page", "tab", "cards"];

/**
 * The "prompt" CardType's actual content, shared by PromptCardView.tsx and
 * PromptCardEditor.tsx (nothing meaningfully differs between "selected" and
 * "selected + editing" here — same precedent as StackBody.tsx). A flip card: the
 * front face is the prompt input + context settings + Send; the back face is the
 * active iteration's rich-text output plus a small rail for moving between past
 * iterations, the same "n / total" convention CardStackRail.tsx uses. Every Send
 * appends a *new* iteration rather than overwriting the last one — flipping back to
 * the front to edit the prompt and sending again builds up a browsable history
 * instead of losing the previous answer (cardMetadata.ts's `prompt.iterations`).
 * Input/context writes straight through via cardStore.editCard on every change, same
 * "no draft, no separate Save step" convention embeds/Dock Cards/the "action"
 * CardType's own calibration UI already use.
 */
export function PromptCardBody({ pageCard }: { pageCard: PageCardWithCard }) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const prompt = canonicalCard.metadata.prompt ?? {
    input: "",
    iterations: [],
    activeIndex: 0,
    context: { mode: "none" as const, cardIds: [] },
  };
  const iterations = prompt.iterations;
  const activeIndex = iterations.length === 0 ? 0 : Math.min(Math.max(prompt.activeIndex, 0), iterations.length - 1);
  const activeIteration = iterations[activeIndex] ?? null;

  const [flipped, setFlipped] = useState(() => iterations.length > 0);
  const [contextPopoverOpen, setContextPopoverOpen] = useState(false);
  const contextWrapRef = useRef<HTMLDivElement>(null);
  const generation = usePromptGeneration();

  // One shared dismiss boundary for the whole context-settings popover (mode buttons
  // + the "cards" mode's ContextCardPicker) — same click-outside/Escape convention
  // every other anchored popover in this app uses (e.g. FeedInputButton.tsx's own
  // popupWrap), kept here rather than inside ContextCardPicker itself since nesting
  // two independent dismiss boundaries would fight each other (see that component's
  // doc comment).
  useEffect(() => {
    if (!contextPopoverOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (contextWrapRef.current && !contextWrapRef.current.contains(e.target as Node)) {
        setContextPopoverOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContextPopoverOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextPopoverOpen]);

  function patchPrompt(patch: Partial<typeof prompt>) {
    editCard(pageCard.card.id, { metadata: { ...canonicalCard.metadata, prompt: { ...prompt, ...patch } } });
  }

  function updateInput(input: string) {
    patchPrompt({ input });
  }

  function setContextMode(mode: PromptCardContextMode) {
    patchPrompt({ context: { ...prompt.context, mode } });
  }

  function toggleContextCard(cardId: string) {
    const cardIds = prompt.context.cardIds.includes(cardId)
      ? prompt.context.cardIds.filter((id) => id !== cardId)
      : [...prompt.context.cardIds, cardId];
    patchPrompt({ context: { ...prompt.context, cardIds } });
  }

  function goToIteration(index: number) {
    patchPrompt({ activeIndex: Math.max(0, Math.min(index, iterations.length - 1)) });
  }

  function handleSend() {
    const input = prompt.input.trim();
    if (input === "" || generation.streaming) return;
    setFlipped(true);
    setContextPopoverOpen(false);
    generation.start(pageCard.id, input, prompt.context.mode, prompt.context.cardIds, (output) => {
      // Re-reads the live Card rather than closing over the render-time `prompt`/
      // `canonicalCard` — a generation can take a while, and this avoids clobbering
      // any metadata change (e.g. a context-mode edit) that landed while it streamed.
      const freshCard = getCachedCard(pageCard.card.id) ?? canonicalCard;
      const freshPrompt = freshCard.metadata.prompt ?? prompt;
      const nextIterations = [...freshPrompt.iterations, { input, output, createdAt: new Date().toISOString() }];
      editCard(pageCard.card.id, {
        metadata: {
          ...freshCard.metadata,
          prompt: { ...freshPrompt, iterations: nextIterations, activeIndex: nextIterations.length - 1 },
        },
      });
    });
  }

  return (
    <div className="prompt-card">
      <div className={`prompt-card__flip${flipped ? " prompt-card__flip--flipped" : ""}`}>
        <div className={`prompt-card__face prompt-card__face--front${flipped ? " prompt-card__face--hidden" : ""}`}>
          <InputField
            className="prompt-card__input"
            multiline
            value={prompt.input}
            placeholder={t("promptCard.inputPlaceholder")}
            onChange={(e) => updateInput(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="prompt-card__actions">
            <div className="prompt-card__context-wrap" ref={contextWrapRef}>
              <Button
                iconOnly
                onClick={(e) => {
                  e.stopPropagation();
                  setContextPopoverOpen((open) => !open);
                }}
                aria-label={t("promptCard.context.settings")}
                title={t("promptCard.context.settings")}
              >
                <Icon name="settings" />
              </Button>
              {contextPopoverOpen && (
                <div className="prompt-card__context-popover">
                  <div className="prompt-card__context-modes">
                    {CONTEXT_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`prompt-card__context-mode${
                          prompt.context.mode === mode ? " prompt-card__context-mode--active" : ""
                        }`}
                        onClick={() => setContextMode(mode)}
                      >
                        {t(`promptCard.context.${mode}`)}
                      </button>
                    ))}
                  </div>
                  {prompt.context.mode === "cards" && (
                    <ContextCardPicker
                      selectedIds={prompt.context.cardIds}
                      onToggle={toggleContextCard}
                      onDone={() => setContextPopoverOpen(false)}
                    />
                  )}
                </div>
              )}
            </div>
            {iterations.length > 0 && (
              <Button onClick={() => setFlipped(true)}>
                <Icon name="expand" />
                {t("promptCard.viewOutput")}
              </Button>
            )}
            <Button onClick={handleSend} disabled={prompt.input.trim() === "" || generation.streaming}>
              <Icon name="generate" />
              {t("promptCard.send")}
            </Button>
          </div>
        </div>
        <div className={`prompt-card__face prompt-card__face--back${flipped ? "" : " prompt-card__face--hidden"}`}>
          <div className="prompt-card__rail">
            <Button
              iconOnly
              onClick={() => setFlipped(false)}
              aria-label={t("promptCard.editPrompt")}
              title={t("promptCard.editPrompt")}
            >
              <Icon name="edit" />
            </Button>
            {iterations.length > 1 && (
              <>
                <Button
                  iconOnly
                  aria-label={t("cardStack.previous")}
                  title={t("cardStack.previous")}
                  disabled={activeIndex === 0}
                  onClick={() => goToIteration(activeIndex - 1)}
                >
                  <Icon name="up" className="prompt-card__rail-arrow prompt-card__rail-arrow--left" />
                </Button>
                <span className="prompt-card__rail-position">
                  {activeIndex + 1} / {iterations.length}
                </span>
                <Button
                  iconOnly
                  aria-label={t("cardStack.next")}
                  title={t("cardStack.next")}
                  disabled={activeIndex === iterations.length - 1}
                  onClick={() => goToIteration(activeIndex + 1)}
                >
                  <Icon name="up" className="prompt-card__rail-arrow prompt-card__rail-arrow--right" />
                </Button>
              </>
            )}
          </div>
          {generation.streaming ? (
            <div className="prompt-card__generating">
              <Icon name="generate" spin />
              <span>{t("promptCard.sending")}</span>
              <Button onClick={generation.stop}>
                <Icon name="stop" />
                {t("promptCard.stop")}
              </Button>
            </div>
          ) : activeIteration ? (
            <CardRichText
              key={activeIndex}
              content={activeIteration.output}
              onChangeContent={() => {}}
              editable={false}
              cardId={pageCard.card.id}
              ancestorIds={EMPTY_ANCESTOR_IDS}
              depth={0}
            />
          ) : (
            <p className="prompt-card__empty">{t("promptCard.noOutputYet")}</p>
          )}
        </div>
      </div>
      {generation.error && <p className="prompt-card__error">{t("promptCard.errorPrefix")}{generation.error}</p>}
    </div>
  );
}
