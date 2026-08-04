import { useEffect, useState } from "react";
import type { Card, NearbyItem } from "@wattle/shared";
import { getDurableNearby } from "../../api/client.js";
import { editCard, ensureCardLoaded, getCachedCard } from "../../lib/cardStore.js";
import { Button, Icon } from "../primitives/index.js";
import { CardPropertyRow } from "./CardPropertyRow.js";
import { t } from "../../i18n/index.js";
import "./CardInfoPanel.css";

interface CardInfoPanelProps {
  card: Card;
  onClose: () => void;
}

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
export function CardInfoPanel({ card, onClose }: CardInfoPanelProps) {
  const isFrozen = Boolean(card.frozenAt);
  const properties = card.metadata.properties;
  const linkIds = card.metadata.links ?? [];
  const [links, setLinks] = useState<Card[]>([]);
  const [linksLoading, setLinksLoading] = useState(linkIds.length > 0);
  const [nearby, setNearby] = useState<NearbyItem[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(true);

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
      <div className="card-info__header">
        <span className="card-info__title">{t("card.info.title")}</span>
        <Button
          iconOnly
          aria-label={t("card.hideInfo")}
          title={t("card.hideInfo")}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <Icon name="back" />
        </Button>
      </div>

      <div className="card-info__section">
        <span className="card-info__label">{t("card.titlePlaceholder")}</span>
        <p className="card-info__value">{card.title || t("common.untitled")}</p>
      </div>

      <div className="card-info__row">
        <div className="card-info__section">
          <span className="card-info__label">{t("card.info.created")}</span>
          <p className="card-info__value">{formatDate(card.createdAt)}</p>
        </div>
        <div className="card-info__section">
          <span className="card-info__label">{t("card.info.updated")}</span>
          <p className="card-info__value">{formatDate(card.updatedAt)}</p>
        </div>
      </div>

      <div className="card-info__section">
        <span className="card-info__label">{t("card.info.status")}</span>
        <div className="card-info__badges">
          <span className="card-info__badge">
            {card.savedToVault ? t("card.info.statusSaved") : t("card.info.statusDraft")}
          </span>
          {card.frozenAt && (
            <span className="card-info__badge">
              <Icon name="lock" /> {t("card.info.statusFrozen")}
            </span>
          )}
          {card.forkedFromId && <span className="card-info__badge">{t("card.info.forkedFrom")}</span>}
        </div>
      </div>

      <div className="card-info__section">
        <span className="card-info__label">{t("card.info.properties")}</span>
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
                {linked.title || t("common.untitled")}
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
                {item.title || t("common.untitled")}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
