import type { FC } from "react";
import type { PageCardWithCard } from "@wattle/shared";

/** Props for a CardType's non-editing, in-Page render. */
export interface CardTypeViewProps {
  pageCard: PageCardWithCard;
  selected: boolean;
  onSelect: () => void;
  onRequestEdit: () => void;
  /** Every Card's top-right "expand" corner button (App.tsx's focusedPageCardId) —
   *  optional since not every registered type necessarily surfaces it; currently
   *  "stack" (StackView.tsx) and "file" (FileView.tsx) do. */
  onOpenFullscreen?: (pageCardId: string) => void;
  /** Every Card's top-right "X" corner button (App.tsx's
   *  handleRequestRemovePageCard) — closes/removes this Card from the Page. Same
   *  optionality/forwarding convention as onOpenFullscreen above. */
  onRequestRemove?: (pageCardId: string) => void;
  /** Fires one of the fixed action jobs (lib/actionJobs.ts) — the "note" branch
   *  (Card.tsx, via CardEditingContext) has had this since the inline actionButton
   *  node; the "action" CardType (ActionCardView.tsx) is the only *other* consumer
   *  today. Optional since most types have nothing to run. */
  onRunActionJob?: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => void;
  /** Non-null while a job/generation this exact PageCard triggered is still
   *  running — same "== this PageCard's own id" convention CardEditingContext's
   *  actionButton check already uses, just surfaced here for types outside the
   *  rich-text system. */
  generatingPageCardId?: string | null;
}

/** Props for a CardType's inline editor, swapped in for the View while editing. */
export interface CardTypeEditorProps {
  pageCard: PageCardWithCard;
  onChangeDraft: (draft: { title?: string; content?: string }) => void;
  /** Same as CardTypeViewProps.onOpenFullscreen above. */
  onOpenFullscreen?: (pageCardId: string) => void;
  /** Same as CardTypeViewProps.onRequestRemove above. */
  onRequestRemove?: (pageCardId: string) => void;
  /** Same as CardTypeViewProps.onRunActionJob above. */
  onRunActionJob?: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => void;
  /** Same as CardTypeViewProps.generatingPageCardId above. */
  generatingPageCardId?: string | null;
  /** Every PageCard on the same Page — ActionJobFields' removeCard/saveCard "pick a
   *  card on this page" selector (the "action" CardType's own calibration UI,
   *  ActionCardEditor.tsx) needs this the same way an inline actionButton's
   *  ActionButtonConfigPopover already does. */
  pageSiblings?: PageCardWithCard[];
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

  /** For call sites that need to render *something* reasonable for a Card whose
   *  stored `metadata.typeId` doesn't match any currently-registered type (e.g. a
   *  leftover value from a CardType that's since been removed) rather than crashing
   *  on `.get()` — see PageStack.tsx's PageCardSlot. */
  has(typeId: string): boolean {
    return this.definitions.has(typeId);
  }

  list(): CardTypeUiDefinition[] {
    return [...this.definitions.values()];
  }
}

export const cardTypeUiRegistry = new CardTypeUiRegistry();
