import type { FC } from "react";
import type { PageCardWithCard } from "@wattle/shared";

/** Props for a CardType's non-editing, in-Page render. */
export interface CardTypeViewProps {
  pageCard: PageCardWithCard;
  selected: boolean;
  onSelect: () => void;
  onRequestEdit: () => void;
}

/** Props for a CardType's inline editor, swapped in for the View while editing. */
export interface CardTypeEditorProps {
  pageCard: PageCardWithCard;
  onChangeDraft: (draft: { title?: string; content?: string }) => void;
}

/** Props for the tile a future type picker shows per CardType, one per registered type. */
export interface CardTypePickerTileProps {
  onSelect: () => void;
}

/**
 * The UI counterpart to @wattle/shared's CardTypeDefinition: what to render for a
 * CardType, as opposed to what data it holds. Kept as a separate registry (rather than
 * a field on CardTypeDefinition) because @wattle/shared can't depend on React — see
 * cardType.ts.
 */
export interface CardTypeUiDefinition {
  /** Must match a registered CardTypeDefinition.id. */
  typeId: string;
  PickerTile: FC<CardTypePickerTileProps>;
  View: FC<CardTypeViewProps>;
  Editor: FC<CardTypeEditorProps>;
}

export class CardTypeUiRegistry {
  private readonly definitions = new Map<string, CardTypeUiDefinition>();

  register(def: CardTypeUiDefinition): void {
    if (this.definitions.has(def.typeId)) {
      throw new Error(`CardTypeUi "${def.typeId}" is already registered`);
    }
    this.definitions.set(def.typeId, def);
  }

  get(typeId: string): CardTypeUiDefinition {
    const def = this.definitions.get(typeId);
    if (!def) {
      throw new Error(`CardTypeUi "${typeId}" is not registered`);
    }
    return def;
  }

  list(): CardTypeUiDefinition[] {
    return [...this.definitions.values()];
  }
}

export const cardTypeUiRegistry = new CardTypeUiRegistry();
