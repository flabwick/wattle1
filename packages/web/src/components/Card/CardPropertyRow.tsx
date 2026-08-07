import { useRef, useState } from "react";
import type { Card, CardMetadataV1 } from "@wattle/shared";
import { useCard } from "../../hooks/useCard.js";
import { Button, Icon, InputField } from "../primitives/index.js";
import { CardLinkPicker } from "./CardLinkPicker.js";
import { t } from "../../i18n/index.js";

type CardProperty = CardMetadataV1["properties"][number];

interface CardPropertyRowProps {
  property: CardProperty;
  isFrozen: boolean;
  onChangeKey: (key: string) => void;
  onChangeValue: (value: string) => void;
  onLinkCard: (card: Card) => void;
  onUnlink: () => void;
  onRemove: () => void;
}

/**
 * One row of a Card's user-editable `metadata.properties` (CardInfoPanel.tsx) — a
 * key field plus a value that's either plain text or, once linked, a live reference
 * to another Card. Split out from CardInfoPanel.tsx because the two value states
 * each need their own hook (useCard for a linked value, local popover state for a
 * text value's "@" trigger) — conditionally calling one or the other inline in a
 * `.map()` would violate the rules of hooks, but swapping which *component*
 * renders per-row is fine.
 */
export function CardPropertyRow({
  property,
  isFrozen,
  onChangeKey,
  onChangeValue,
  onLinkCard,
  onUnlink,
  onRemove,
}: CardPropertyRowProps) {
  return (
    <div className="card-info__property-row">
      <InputField
        className="card-info__property-key"
        value={property.key}
        placeholder={t("card.info.propertyKeyPlaceholder")}
        disabled={isFrozen}
        onChange={(e) => onChangeKey(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
      {property.linkedCardId ? (
        <LinkedPropertyValue cardId={property.linkedCardId} isFrozen={isFrozen} onUnlink={onUnlink} />
      ) : (
        <TextPropertyValue
          value={property.value}
          isFrozen={isFrozen}
          onChangeValue={onChangeValue}
          onLinkCard={onLinkCard}
        />
      )}
      <Button
        iconOnly
        aria-label={t("card.info.removeProperty")}
        title={t("card.info.removeProperty")}
        disabled={isFrozen}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Icon name="close" />
      </Button>
    </div>
  );
}

/** A property value that's already linked — resolved live via useCard (same
 *  "always show the current title, not a stale cache" convention
 *  CardInfoPanel.tsx's own Links/Relationships sections use), with its own small
 *  "x" to unlink and drop back to a plain text value. */
function LinkedPropertyValue({
  cardId,
  isFrozen,
  onUnlink,
}: {
  cardId: string;
  isFrozen: boolean;
  onUnlink: () => void;
}) {
  const { card } = useCard(cardId);
  return (
    <span className="card-info__property-link">
      <Icon name="link" className="card-info__property-link-icon" />
      <span className="card-info__property-link-title">{card ? card.title : "…"}</span>
      {!isFrozen && (
        <button
          type="button"
          className="card-info__property-unlink"
          aria-label={t("card.info.unlinkProperty")}
          title={t("card.info.unlinkProperty")}
          onClick={(e) => {
            e.stopPropagation();
            onUnlink();
          }}
        >
          <Icon name="close" />
        </button>
      )}
    </span>
  );
}

/** A plain-text property value — typing "@" (anywhere in the field, not just at the
 *  start) opens a CardLinkPicker right below it instead of inserting the character,
 *  same search-as-you-type popover the rich-text editor's own "insert card link"
 *  toolbar button uses. There's no caret-position tracking anywhere else in this
 *  app (every popover here anchors to its trigger element, not a text cursor — see
 *  CardLinkPicker.tsx's own doc comment), so this follows that same convention:
 *  the picker anchors to the value field itself, not to where "@" was typed. */
function TextPropertyValue({
  value,
  isFrozen,
  onChangeValue,
  onLinkCard,
}: {
  value: string;
  isFrozen: boolean;
  onChangeValue: (value: string) => void;
  onLinkCard: (card: Card) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <div className="card-info__property-value-wrap" ref={wrapRef}>
      <InputField
        className="card-info__property-value"
        value={value}
        placeholder={t("card.info.propertyValuePlaceholder")}
        disabled={isFrozen}
        onChange={(e) => onChangeValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "@" && !isFrozen) {
            e.preventDefault();
            setPickerOpen(true);
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {pickerOpen && (
        <CardLinkPicker
          onSelect={(card) => {
            onLinkCard(card);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
