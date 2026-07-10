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
   *  priority over, `selected`/`selectedPage` — see App.tsx/CardContent.tsx). Embeds
   *  are always already-saved vault Cards (CardLinkPicker only offers saved ones), so
   *  there's no Edit/Save/Generate action for one here, just Remove/Delete. */
  selectedEmbedId: string | null;
  onRemoveEmbed: () => void;
  onDeleteEmbed: () => void;
  generating: boolean;
  /** Live text streamed so far from the Step 2 SSE preview endpoint, while generating. */
  streamingText?: string;
  onEdit: () => void;
  onSave: () => void;
  onRemoveFromPage: () => void;
  onGenerate: () => void;
  onAddCardToPage: () => void;
  onDeletePage: () => void;
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
 * Card/Delete Page; a Card selected -> Edit/Save/Generate/Remove (X — removes this
 * Card from this Page only, the vault copy is untouched and can be reopened any
 * time; permanently deleting a Card from the vault lives in the Vault panel
 * instead, on each Card there, not here). Edit still
 * opens the same inline title/textarea editor on the Card itself (Card.tsx); the Dock
 * only triggers it, it doesn't render it. Save has no separate "unsaved" Badge
 * anywhere — the action's own icon is the indicator: a `+` while there's a draft to
 * commit, a tick once it's saved (and disabled, since there's nothing left to do).
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
  onRemoveEmbed,
  onDeleteEmbed,
  generating,
  streamingText,
  onEdit,
  onSave,
  onRemoveFromPage,
  onGenerate,
  onAddCardToPage,
  onDeletePage,
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

  const vaultPanel = vaultOpen && (
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
        key: "generate",
        operationId: "card.generate",
        icon: "generate" as const,
        spin: generating,
        label: generating ? t("dock.action.generating") : t("dock.action.generate"),
        onClick: onGenerate,
        disabled: generating,
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

  const actions: DockAction[] = [vaultAction, ...modeActions];

  return (
    <footer className="dock">
      {vaultPanel}
      {generating && streamingText && (
        <div className="dock__stream-preview">{streamingText}</div>
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
