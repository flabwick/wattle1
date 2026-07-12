import { useRef, useState } from "react";
import type { Card, PageCardWithCard, PageWithCards } from "@wattle/shared";
import { cardTypeRegistry, operationRegistry } from "@wattle/shared";
import { Button, Icon } from "../primitives/index.js";
import type { IconName } from "../primitives/Icon.js";
import { VaultView } from "../Vault/VaultView.js";
import { getCardTypeId } from "../../lib/getCardTypeId.js";
import { t } from "../../i18n/index.js";
import "./Dock.css";

interface DockProps {
  selected: PageCardWithCard | null;
  /** A selected Page (mutually exclusive with `selected` — see App.tsx). */
  selectedPage: PageWithCards | null;
  /** An independently-selected embedded Card's id (mutually exclusive with, and takes
   *  priority over, `selected`/`selectedPage` — see App.tsx/CardContent.tsx). Gets the
   *  same Edit/Save/Remove/Delete actions a top-level Card does — Save is always
   *  shown already-done since embeds are always already-saved vault Cards
   *  (CardLinkPicker only offers saved ones) that write straight through on every
   *  keystroke, so there's never anything pending to commit. There's no per-embed
   *  Generate: Generate is only ever available with nothing selected at all (see the
   *  `selected`/`selectedPage` branches below). */
  selectedEmbedId: string | null;
  onEditEmbed: () => void;
  onRemoveEmbed: () => void;
  onDeleteEmbed: () => void;
  generating: boolean;
  /** True once a generation has finished streaming and is showing as a ghost card
   *  (PageStack.tsx/GhostCard.tsx) awaiting Accept/Deny — a distinct Dock state that
   *  replaces the normal Card action row, the same way Move Mode does. */
  reviewingGeneration: boolean;
  /** Set once a generation stream ends in an error (bad credentials, network failure,
   *  malformed model output — see useGeneration.ts) rather than a valid root card.
   *  Shown as a dismissible banner instead of silently doing nothing. */
  generationError: string | null;
  onDismissGenerationError: () => void;
  onAcceptGeneration: () => void;
  onDenyGeneration: () => void;
  onEdit: () => void;
  onSave: () => void;
  onRemoveFromPage: () => void;
  onAddCardToPage: () => void;
  /** Generate with nothing selected — appends at the bottom of the current Page
   *  instead of directly below a specific Card (App.tsx/useGeneration.ts's
   *  startForPage). Null when there's no current Page to generate into. */
  onGeneratePage: (() => void) | null;
  onDeletePage: () => void;
  /** Move Mode (the Dock's Move action) — see App.tsx's movingPageCardId. Non-null
   *  while a Card is "in transit" waiting for a drop target to be tapped. */
  movingPageCardId: string | null;
  onEnterMoveMode: () => void;
  onCancelMove: () => void;
  /** Vault extension panel, toggled from the Dock (spec1.md Part 3 "Vault"). */
  vaultCards: Card[];
  vaultQuery: string;
  onVaultQueryChange: (q: string) => void;
  /** Create a new blank Card directly on the current Page, IDE-"new file" style. */
  onCreateCardInPage: (() => void) | null;
  onDeleteVaultCard: (id: string) => void;
  /** Add a vault Card to the current Page, if one exists. */
  onAddVaultCardToPage: ((cardId: string) => void) | null;
  /** Upload a file onto the current Page as a new "file"-typed Card, if one exists. */
  onUploadFileToPage: ((file: File) => void) | null;
}

interface DockAction {
  key: string;
  /**
   * Operation id gating this action, or null if it isn't part of the OperationRegistry
   * at all — "remove from page" was deliberately left as an ad hoc, unwrapped mutation
   * in Step 1 (packages/shared/src/registries/README.md explains why), so there's no
   * id to gate it on; it's always shown.
   */
  operationId: string | null;
  icon: IconName;
  spin?: boolean;
  /** Accessible name (aria-label/title) — the button shows only the icon now. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * Which Operation ids a CardType allows, resolved against every Operation actually
 * registered (operationRegistry.list()) — a `["*"]` wildcard (the "note" type's
 * current value) means "everything registered", not literally the string "*".
 */
function supportedOperationIds(typeId: string): Set<string> {
  const cardType = cardTypeRegistry.get(typeId);
  const registeredIds = operationRegistry.list().map((op) => op.id);
  if (cardType.supportsOperations.includes("*")) {
    return new Set(registeredIds);
  }
  return new Set(cardType.supportsOperations.filter((id) => registeredIds.includes(id)));
}

/**
 * A single-row sticky footer (spec1.md Part 2 "The Dock") that's always the same
 * small height, whatever's selected — no title text, ever (Step 9): only the row of
 * icon buttons changes. The Vault toggle is always the first button in that same
 * row rather than a header row of its own, so the Dock never grows a second row on
 * its own; only the expandable Vault panel or a live generation preview (both
 * genuinely temporary) ever make it taller than that one row.
 *
 * Nothing selected -> just the Vault toggle; a Page selected (and no Card) -> + Add
 * Card/Generate/Delete Page; a Card or embedded Card selected -> Edit/Save/Remove
 * (X — removes this Card from this Page, or this embed's `[[cardId]]` token from its
 * parent's content — only; the vault copy is untouched and can be reopened any time;
 * permanently deleting a Card from the vault lives in the Vault panel instead, on
 * each Card there, not here). Generate is deliberately *only* ever available with
 * nothing selected at all — selecting any Card or embed hides it, there's no
 * "generate below this Card" affordance any more. Edit still opens the same inline
 * title/textarea editor on the Card itself (Card.tsx/CardEmbed.tsx); the Dock only
 * triggers it, it doesn't render it. Save has no separate "unsaved" Badge anywhere —
 * the action's own icon is the indicator: a `+` while there's a draft to commit, a
 * tick once it's saved (and disabled, since there's nothing left to do; an embed is
 * always in this disabled/done state, since it has no draft step at all).
 *
 * The Card action buttons shown are derived from the selected Card's CardType
 * (cardTypeRegistry) and the Operations it supports (operationRegistry) rather than a
 * fixed list — see supportedOperationIds above. Page actions aren't part of that
 * registry (Pages aren't Cards), so they're unconditional.
 */
export function Dock({
  selected,
  selectedPage,
  selectedEmbedId,
  onEditEmbed,
  onRemoveEmbed,
  onDeleteEmbed,
  generating,
  reviewingGeneration,
  generationError,
  onDismissGenerationError,
  onAcceptGeneration,
  onDenyGeneration,
  onEdit,
  onSave,
  onRemoveFromPage,
  onAddCardToPage,
  onGeneratePage,
  onDeletePage,
  movingPageCardId,
  onEnterMoveMode,
  onCancelMove,
  vaultCards,
  vaultQuery,
  onVaultQueryChange,
  onCreateCardInPage,
  onDeleteVaultCard,
  onAddVaultCardToPage,
  onUploadFileToPage,
}: DockProps) {
  const [vaultOpen, setVaultOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vaultLabel = vaultOpen ? t("dock.vault.close") : t("dock.vault.open");
  const vaultAction: DockAction = {
    key: "vault",
    operationId: null,
    icon: vaultOpen ? "close" : "vault",
    label: vaultLabel,
    onClick: () => setVaultOpen((open) => !open),
  };

  const vaultPanel = vaultOpen && !movingPageCardId && !reviewingGeneration && (
    <div className="dock__vault-panel">
      <VaultView
        cards={vaultCards}
        query={vaultQuery}
        onQueryChange={onVaultQueryChange}
        onCreateCard={
          onCreateCardInPage
            ? () => {
                onCreateCardInPage();
                setVaultOpen(false);
              }
            : null
        }
        onDeleteCard={onDeleteVaultCard}
        onOpenIntoTopPage={
          onAddVaultCardToPage
            ? (cardId) => {
                onAddVaultCardToPage(cardId);
                setVaultOpen(false);
              }
            : null
        }
      />
    </div>
  );

  let modeActions: DockAction[] = [];

  if (selectedEmbedId) {
    modeActions = [
      {
        key: "editEmbed",
        operationId: null,
        icon: "edit" as const,
        label: t("dock.action.edit"),
        onClick: onEditEmbed,
      },
      {
        key: "saveEmbed",
        operationId: null,
        // Always already-done: an embed writes straight through to the vault on
        // every keystroke (CardEmbed.tsx/editCard), so there's never a pending draft
        // to commit — same convention as a top-level Card's tick-and-disabled state
        // once it has nothing left to save.
        icon: "done" as const,
        label: t("dock.action.save"),
        onClick: () => {},
        disabled: true,
      },
      {
        key: "removeEmbed",
        operationId: null,
        icon: "close" as const,
        label: t("dock.action.remove"),
        onClick: onRemoveEmbed,
      },
      {
        key: "deleteEmbed",
        operationId: null,
        icon: "delete" as const,
        label: t("dock.action.delete"),
        onClick: onDeleteEmbed,
        danger: true,
      },
    ];
  } else if (selected) {
    // Needs saving if there's a pending draft edit not yet committed, OR the Card has
    // never been saved to the Vault at all yet (still page-local scratch content from
    // creation/generation — see schema.prisma's Card.savedToVault doc comment).
    const hasUnsavedDraft =
      selected.draftTitle !== null ||
      selected.draftContent !== null ||
      !selected.card.savedToVault;
    const available = supportedOperationIds(getCardTypeId(selected.card));
    modeActions = [
      {
        key: "edit",
        operationId: "card.edit",
        icon: "edit" as const,
        label: t("dock.action.edit"),
        onClick: onEdit,
      },
      {
        key: "save",
        operationId: "card.save",
        // + while there's something to commit, a tick once it's saved — the button
        // itself is the "unsaved" indicator now, instead of a separate Badge on the
        // Card (see Card.tsx).
        icon: hasUnsavedDraft ? ("plus" as const) : ("done" as const),
        label: t("dock.action.save"),
        onClick: onSave,
        disabled: !hasUnsavedDraft,
      },
      {
        key: "move",
        operationId: null,
        icon: "move" as const,
        label: t("dock.action.move"),
        onClick: onEnterMoveMode,
      },
      {
        key: "remove",
        operationId: null,
        icon: "close" as const,
        label: t("dock.action.remove"),
        onClick: onRemoveFromPage,
      },
    ].filter((action) => action.operationId === null || available.has(action.operationId));
  } else if (selectedPage) {
    modeActions = [
      {
        key: "addCard",
        operationId: null,
        icon: "plus" as const,
        label: t("pageStack.addCard"),
        onClick: onAddCardToPage,
      },
      ...(onUploadFileToPage
        ? [
            {
              key: "uploadFile",
              operationId: null,
              icon: "upload" as const,
              label: t("dock.action.upload"),
              onClick: () => fileInputRef.current?.click(),
            },
          ]
        : []),
      ...(onGeneratePage
        ? [
            {
              key: "generatePage",
              operationId: null,
              icon: "generate" as const,
              spin: generating,
              label: generating ? t("dock.action.generating") : t("dock.action.generate"),
              onClick: onGeneratePage,
              disabled: generating,
            },
          ]
        : []),
      {
        key: "deletePage",
        operationId: null,
        icon: "delete" as const,
        label: t("pageStack.deletePage"),
        onClick: onDeletePage,
        danger: true,
      },
    ];
  }

  // A finished generation awaiting review (App.tsx/useGeneration.ts) collapses the
  // Dock to just Accept/Deny on the ghost card — same pattern as Move Mode below —
  // since nothing else should happen until that's resolved one way or the other.
  const reviewActions: DockAction[] = [
    {
      key: "denyGeneration",
      operationId: null,
      icon: "close" as const,
      label: t("dock.action.denyGeneration"),
      onClick: onDenyGeneration,
    },
    {
      key: "acceptGeneration",
      operationId: null,
      icon: "done" as const,
      label: t("dock.action.acceptGeneration"),
      onClick: onAcceptGeneration,
    },
  ];

  // While a Card is in transit (Move Mode), the Dock collapses to just a Cancel
  // action — no Vault toggle, no other Card/Page actions — so the only thing to do
  // is tap a drop target (PageStack.tsx) or back out.
  const actions: DockAction[] = reviewingGeneration
    ? reviewActions
    : movingPageCardId
      ? [
          {
            key: "cancelMove",
            operationId: null,
            icon: "close" as const,
            label: t("dock.action.cancelMove"),
            onClick: onCancelMove,
          },
        ]
      : [vaultAction, ...modeActions];

  return (
    <footer className="dock">
      {vaultPanel}
      {generationError && (
        <div className="dock__error-banner" role="alert">
          <span className="dock__error-banner-text">{generationError}</span>
          <button
            type="button"
            className="dock__error-banner-dismiss"
            aria-label={t("dock.action.dismiss")}
            title={t("dock.action.dismiss")}
            onClick={onDismissGenerationError}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {onUploadFileToPage && (
        <input
          ref={fileInputRef}
          type="file"
          className="dock__file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadFileToPage(file);
            // Reset so selecting the same file again still fires onChange.
            e.target.value = "";
          }}
        />
      )}
      <div className="dock__row">
        {actions.map((action) => (
          <Button
            key={action.key}
            iconOnly
            variant={action.danger ? "danger" : "default"}
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.label}
            title={action.label}
          >
            <Icon name={action.icon} spin={action.spin} />
          </Button>
        ))}
      </div>
    </footer>
  );
}
