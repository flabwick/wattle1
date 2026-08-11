import type { FC } from "react";
import type { PageCardWithCard } from "@wattle/shared";
import type { StepOutput } from "../lib/actionJobRegistry.js";

/** Props for a CardType's non-editing, in-Page render. */
export interface CardTypeViewProps {
  pageCard: PageCardWithCard;
  selected: boolean;
  onSelect: () => void;
  onRequestEdit: () => void;
  /** Dispatches one job from the actionJobRegistry.ts vocabulary (lib/actionJobs.ts's
   *  runActionJob) — the "note" branch (Card.tsx, via CardEditingContext) has had
   *  this since the inline actionButton node; the "action" CardType
   *  (ActionCardView.tsx) is the only *other* consumer today. Optional since most
   *  types have nothing to run.
   *
   *  Returns `Promise<StepOutput | void>` (unlike CardEditingContext's/Card.tsx's
   *  own fire-and-forget `void`-typed copy of this same prop) specifically so
   *  ActionCardView.tsx's own multi-step Run can `await` each step in turn, stop at
   *  the first failure, and capture a card-creating step's own StepOutput for a
   *  later step to reference (`step:<stepId>` — see runSteps). A plain
   *  `void`-typed callback can still be assigned wherever this isn't needed without
   *  conflict (TS's "void return type accepts anything" rule) — but only for a bare
   *  `void` position, not one wrapped in `Promise<...>`, which is why this needed
   *  its own explicit widening rather than being implicitly compatible. */
  onRunActionJob?: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => Promise<StepOutput | void>;
  /** Non-null while a job/generation this exact PageCard triggered is still
   *  running — same "== this PageCard's own id" convention CardEditingContext's
   *  actionButton check already uses, just surfaced here for types outside the
   *  rich-text system. */
  generatingPageCardId?: string | null;
  /** Every PageCard on the same Page — the "operation" CardType's own Run action
   *  (OperationCardBody.tsx) needs this even in View mode (unlike removeCard/
   *  saveCard's own picker, which only ever needs it while editing) to resolve a
   *  `runCardAction` step's target into the full PageCardWithCard onRunActionJob
   *  expects. Optional since every other View ignores it. */
  pageSiblings?: PageCardWithCard[];
  /** The header's own "X" (App.tsx's handleRequestRemovePageCard) — unbound (takes
   *  the pageCardId), same "every CardHeaderActions consumer here binds it itself"
   *  convention onTurnIntoStack below already uses. Optional since not every View
   *  shows the header action row at all. */
  onRemove?: (pageCardId: string) => void;
  /** The header's "+" corner button — turns this Card into a Stack and immediately
   *  adds a second (blank) alternate (App.tsx's handleTurnIntoStackWithNewCard),
   *  same as Card.tsx's own onTurnIntoStack prop. Omitted by the "stack" CardType's
   *  own View, which already has its own way to add an alternate. */
  onTurnIntoStack?: (pageCardId: string) => void;
}

/** Props for a CardType's inline editor, swapped in for the View while editing. */
export interface CardTypeEditorProps {
  pageCard: PageCardWithCard;
  onChangeDraft: (draft: { title?: string; content?: string }) => void;
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
