import { useEffect, useState } from "react";
import type { Card, NearbyItem, PageCardWithCard } from "@wattle/shared";
import { getDurableNearby } from "../../api/client.js";
import { editCard, ensureCardLoaded, getCachedCard } from "../../lib/cardStore.js";
import { Button, Icon, InputField } from "../primitives/index.js";
import { CardPropertyRow } from "./CardPropertyRow.js";
import { ActionStepFields } from "./types/action/ActionStepFields.js";
import { actionJobRegistry } from "../../lib/actionJobRegistry.js";
import { runGenerateSteps } from "../../lib/actionScriptJob.js";
import { t } from "../../i18n/index.js";
import "./CardInfoPanel.css";

interface CardInfoPanelProps {
  card: Card;
  /** Only the "action" CardType's own Actions section (below) needs these — a
   *  cardPicker field's "pick a card on this page" selector. Every other CardType's
   *  back face ignores both. */
  pageSiblings?: PageCardWithCard[];
  excludePageCardId?: string;
}

function makeStepId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Job ids whose own `run()` returns a StepOutput (actionJobRegistry.ts) — the
 *  only steps a *later* step's own "use a card from an earlier step" option
 *  (ActionStepFields.tsx) can meaningfully point at. */
const PRODUCING_JOB_IDS = new Set(["createCard", "copyExistingCard", "linkExistingCard"]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The back face of a flipped Card (Card.tsx) — mostly a read-only summary of the
 * Card itself (when it was created/updated, its vault/Frozen status, the other
 * Cards it links to via metadata.links, and the Cards Wattle's own proximity model
 * considers related), plus one editable section: `metadata.properties`, arbitrary
 * user-defined key/value pairs. Property edits write straight through via
 * cardStore.editCard on every keystroke — same "no draft, no separate Save step"
 * convention the "hidden" toggle (App.tsx) and the prompt/action CardTypes' own
 * metadata already use, safe regardless of this Card's savedToVault state (see
 * that convention's own doc comments). `card` itself comes from the parent's
 * `useCard` subscription, so an edit here is reflected back into `card.metadata`
 * on the very next render, the same as a title edit already is.
 */
export function CardInfoPanel({ card, pageSiblings, excludePageCardId }: CardInfoPanelProps) {
  const isFrozen = Boolean(card.frozenAt);
  const isAction = card.metadata.typeId === "action";
  const action = card.metadata.action ?? { label: "", steps: [] };
  const properties = card.metadata.properties;
  const tags = card.metadata.tags ?? [];
  const linkIds = card.metadata.links ?? [];
  const [links, setLinks] = useState<Card[]>([]);
  const [linksLoading, setLinksLoading] = useState(linkIds.length > 0);
  const [nearby, setNearby] = useState<NearbyItem[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(true);
  const [tagDraft, setTagDraft] = useState("");
  const [scriptInstruction, setScriptInstruction] = useState("");
  const [generatingSteps, setGeneratingSteps] = useState(false);
  const [generateStepsError, setGenerateStepsError] = useState<string | null>(null);

  /** Folders' replacement as the organizing primitive (Pages + Links + Search
   *  rebuild) — free-form strings on the Card itself, found via the Vault's own
   *  search (cardService.listCards), not a tree to browse. Same "writes straight
   *  through, no draft" convention as properties above. Trimmed and deduped so the
   *  same tag can't accumulate blank/duplicate entries from repeated Enter presses. */
  function addTag() {
    const next = tagDraft.trim();
    if (isFrozen || next === "" || tags.includes(next)) {
      setTagDraft("");
      return;
    }
    editCard(card.id, { metadata: { ...card.metadata, tags: [...tags, next] } });
    setTagDraft("");
  }

  function removeTag(tag: string) {
    if (isFrozen) return;
    editCard(card.id, { metadata: { ...card.metadata, tags: tags.filter((t2) => t2 !== tag) } });
  }

  function patchProperties(next: typeof properties) {
    if (isFrozen) return;
    editCard(card.id, { metadata: { ...card.metadata, properties: next } });
  }

  function updatePropertyKey(index: number, key: string) {
    patchProperties(properties.map((p, i) => (i === index ? { ...p, key } : p)));
  }

  function updatePropertyValue(index: number, value: string) {
    patchProperties(properties.map((p, i) => (i === index ? { ...p, value, linkedCardId: null } : p)));
  }

  function linkPropertyToCard(index: number, linked: Card) {
    patchProperties(
      properties.map((p, i) => (i === index ? { ...p, value: linked.title, linkedCardId: linked.id } : p)),
    );
  }

  function unlinkProperty(index: number) {
    patchProperties(properties.map((p, i) => (i === index ? { ...p, linkedCardId: null } : p)));
  }

  function removeProperty(index: number) {
    patchProperties(properties.filter((_, i) => i !== index));
  }

  function addProperty() {
    patchProperties([...properties, { key: "", value: "", linkedCardId: null }]);
  }

  /** The "action" CardType's own step list — same "no draft, writes straight
   *  through" convention as tags/properties above, just relocated here from the
   *  old inline gear-button editor (ActionCardEditor.tsx is now a trivial
   *  fallback — see its own doc comment). */
  function updateAction(patch: Partial<typeof action>) {
    if (isFrozen) return;
    editCard(card.id, { metadata: { ...card.metadata, action: { ...action, ...patch } } });
  }

  function addStep(jobId: string) {
    updateAction({ steps: [...action.steps, { id: makeStepId(), jobId, jobParams: {} }] });
  }

  function updateStepJobId(index: number, jobId: string) {
    updateAction({ steps: action.steps.map((s, i) => (i === index ? { ...s, jobId, jobParams: {} } : s)) });
  }

  function updateStepParams(index: number, jobParams: Record<string, unknown>) {
    updateAction({ steps: action.steps.map((s, i) => (i === index ? { ...s, jobParams } : s)) });
  }

  function removeStep(index: number) {
    updateAction({ steps: action.steps.filter((_, i) => i !== index) });
  }

  function moveStep(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= action.steps.length) return;
    const next = [...action.steps];
    [next[index], next[target]] = [next[target], next[index]];
    updateAction({ steps: next });
  }

  /** "Generate steps with AI" — calls the same underlying logic the "generateSteps"
   *  job uses (actionScriptJob.ts's runGenerateSteps), directly, so a human doesn't
   *  need to pre-build a step just to use it once. Writes straight through
   *  (editCard, inside runGenerateSteps) — this component picks the new steps up
   *  automatically via the live `card` prop, same as every other edit here. */
  async function handleGenerateSteps() {
    const instruction = scriptInstruction.trim();
    if (!instruction || isFrozen) return;
    setGeneratingSteps(true);
    setGenerateStepsError(null);
    try {
      await runGenerateSteps(card.id, instruction);
      setScriptInstruction("");
    } catch (err) {
      setGenerateStepsError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingSteps(false);
    }
  }

  useEffect(() => {
    if (linkIds.length === 0) {
      setLinks([]);
      setLinksLoading(false);
      return;
    }
    let cancelled = false;
    setLinksLoading(true);
    Promise.all(linkIds.map((id) => ensureCardLoaded(id).catch(() => getCachedCard(id)))).then((loaded) => {
      if (cancelled) return;
      setLinks(loaded.filter((c): c is Card => c !== undefined));
      setLinksLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- linkIds is a fresh
    // array each render; join it into a stable dependency key instead.
  }, [linkIds.join(",")]);

  useEffect(() => {
    let cancelled = false;
    setNearbyLoading(true);
    getDurableNearby(card.id)
      .then((items) => {
        if (!cancelled) setNearby(items);
      })
      .catch(() => {
        if (!cancelled) setNearby([]);
      })
      .finally(() => {
        if (!cancelled) setNearbyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  return (
    <div className="card-info">
      {isAction && (
        <div className="card-info__section">
          <span className="card-info__label">{t("card.info.actions")}</span>
          {!isFrozen && (
            <div className="card-info__generate-steps">
              <InputField
                className="card-info__generate-steps-input"
                value={scriptInstruction}
                placeholder={t("actionCard.generateStepsPlaceholder")}
                disabled={generatingSteps}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setScriptInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleGenerateSteps();
                  }
                }}
              />
              <Button
                disabled={generatingSteps || !scriptInstruction.trim()}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleGenerateSteps();
                }}
              >
                <Icon name="generate" spin={generatingSteps} />
                {t("actionCard.generateStepsButton")}
              </Button>
            </div>
          )}
          {generateStepsError && <p className="card-info__generate-steps-error">{generateStepsError}</p>}
          <InputField
            className="card-info__action-label"
            value={action.label}
            placeholder={t("actionCard.labelPlaceholder")}
            disabled={isFrozen}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateAction({ label: e.target.value })}
          />
          <ol className="card-info__action-steps">
            {action.steps.map((step, index) => {
              const job = actionJobRegistry.get(step.jobId);
              // Only steps *before* this one, and only ones that actually produce
              // a Card (PRODUCING_JOB_IDS) — a step can't reference something that
              // hasn't run yet by the time it's this step's own turn (ActionCardView
              // .tsx's runSteps executes strictly in order).
              const stepOptions = action.steps
                .map((s, i) => ({ step: s, position: i + 1 }))
                .slice(0, index)
                .filter(({ step: s }) => PRODUCING_JOB_IDS.has(s.jobId))
                .map(({ step: s, position }) => ({
                  id: s.id,
                  label: `${t("actionCard.stepLabel")} ${position}: ${actionJobRegistry.get(s.jobId)?.label() ?? s.jobId}`,
                }));
              return (
                <li key={step.id} className="card-info__action-step">
                  <div className="card-info__action-step-header">
                    <select
                      className="app-select"
                      value={step.jobId}
                      disabled={isFrozen}
                      onChange={(e) => updateStepJobId(index, e.target.value)}
                    >
                      <option value="">{t("actionCard.job.none")}</option>
                      {actionJobRegistry.list().map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.label()}
                        </option>
                      ))}
                    </select>
                    {!isFrozen && (
                      <div className="card-info__action-step-controls">
                        <Button
                          iconOnly
                          aria-label={t("actionCard.moveStepUp")}
                          title={t("actionCard.moveStepUp")}
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveStep(index, -1);
                          }}
                        >
                          <Icon name="up" />
                        </Button>
                        <Button
                          iconOnly
                          aria-label={t("actionCard.moveStepDown")}
                          title={t("actionCard.moveStepDown")}
                          disabled={index === action.steps.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveStep(index, 1);
                          }}
                        >
                          <Icon name="down" />
                        </Button>
                        <Button
                          iconOnly
                          aria-label={t("actionCard.removeStep")}
                          title={t("actionCard.removeStep")}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStep(index);
                          }}
                        >
                          <Icon name="close" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {job && (
                    <ActionStepFields
                      cardIdForEmbeds={card.id}
                      fields={job.fields}
                      jobParams={step.jobParams}
                      onChange={(next) => updateStepParams(index, next)}
                      pageSiblings={pageSiblings ?? []}
                      excludePageCardId={excludePageCardId ?? ""}
                      variables={properties}
                      stepOptions={stepOptions}
                    />
                  )}
                </li>
              );
            })}
            {action.steps.length === 0 && <li className="card-info__empty">{t("actionCard.stepsEmpty")}</li>}
          </ol>
          {!isFrozen && (
            <select
              className="card-info__add-step app-select"
              value=""
              onChange={(e) => {
                if (e.target.value) addStep(e.target.value);
              }}
            >
              <option value="">{t("actionCard.addStep")}</option>
              {actionJobRegistry.list().map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label()}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="card-info__section">
        <span className="card-info__label">{t("card.info.tags")}</span>
        {tags.length === 0 && <p className="card-info__empty">{t("card.info.tagsEmpty")}</p>}
        {tags.length > 0 && (
          <div className="card-info__tags">
            {tags.map((tag) => (
              <span key={tag} className="card-info__tag">
                {tag}
                {!isFrozen && (
                  <button
                    type="button"
                    className="card-info__tag-remove"
                    aria-label={t("card.info.removeTag")}
                    title={t("card.info.removeTag")}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTag(tag);
                    }}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {!isFrozen && (
          <InputField
            className="card-info__tag-input"
            value={tagDraft}
            placeholder={t("card.info.addTagPlaceholder")}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
          />
        )}
      </div>

      <div className="card-info__section">
        <span className="card-info__label">{isAction ? t("card.info.variables") : t("card.info.properties")}</span>
        {isAction && <p className="card-info__hint">{t("card.info.variablesHint")}</p>}
        {properties.length === 0 && <p className="card-info__empty">{t("card.info.propertiesEmpty")}</p>}
        {properties.length > 0 && (
          <div className="card-info__properties">
            {properties.map((property, index) => (
              <CardPropertyRow
                key={index}
                property={property}
                isFrozen={isFrozen}
                onChangeKey={(key) => updatePropertyKey(index, key)}
                onChangeValue={(value) => updatePropertyValue(index, value)}
                onLinkCard={(linked) => linkPropertyToCard(index, linked)}
                onUnlink={() => unlinkProperty(index)}
                onRemove={() => removeProperty(index)}
              />
            ))}
          </div>
        )}
        {!isFrozen && (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              addProperty();
            }}
          >
            <Icon name="plus" />
            {t("card.info.addProperty")}
          </Button>
        )}
      </div>

      <div className="card-info__section">
        <span className="card-info__label">{t("card.info.links")}</span>
        {linksLoading ? (
          <p className="card-info__empty">{t("card.info.relationshipsLoading")}</p>
        ) : links.length === 0 ? (
          <p className="card-info__empty">{t("card.info.linksEmpty")}</p>
        ) : (
          <ul className="card-info__list">
            {links.map((linked) => (
              <li key={linked.id} className="card-info__list-item">
                {linked.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card-info__section">
        <span className="card-info__label">{t("card.info.relationships")}</span>
        {nearbyLoading ? (
          <p className="card-info__empty">{t("card.info.relationshipsLoading")}</p>
        ) : nearby.length === 0 ? (
          <p className="card-info__empty">{t("card.info.relationshipsEmpty")}</p>
        ) : (
          <ul className="card-info__list">
            {nearby.map((item) => (
              <li key={item.cardId} className="card-info__list-item">
                {item.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* A single compact line, not four separate labeled sections — title/dates/
          status are the least likely reason anyone flips a Card (Tags/Variables/
          Links/Relationships above are), so this is deliberately terse and pushed
          to the very bottom rather than the old top-of-panel treatment. */}
      <p className="card-info__meta">
        {card.title && <span className="card-info__meta-title">{card.title}</span>}
        <span>{formatDate(card.createdAt)}</span>
        <span>{formatDate(card.updatedAt)}</span>
        <span>{card.savedToVault ? t("card.info.statusSaved") : t("card.info.statusDraft")}</span>
        {card.frozenAt && (
          <span>
            <Icon name="lock" /> {t("card.info.statusFrozen")}
          </span>
        )}
        {card.forkedFromId && <span>{t("card.info.forkedFrom")}</span>}
      </p>
    </div>
  );
}
