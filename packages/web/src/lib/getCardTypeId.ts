import type { Card } from "@wattle/shared";

/**
 * The single place that decides which CardType a Card belongs to. Every lookup into
 * cardTypeRegistry/cardTypeUiRegistry should go through here rather than hardcoding
 * "note", so there's exactly one spot to update if type ever moves off metadata onto
 * a real `Card.typeId` column (see the C0 doc). Absent typeId (every Card created
 * before the file-upload feature) means "note".
 */
export function getCardTypeId(card: Card): string {
  return card.metadata.typeId ?? "note";
}
