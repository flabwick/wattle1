import { useState } from "react";
import type { Card, PageCardWithCard } from "@wattle/shared";
import { cardTypeRegistry, operationRegistry } from "@wattle/shared";
import { Button } from "../primitives/index.js";
import { VaultView } from "../Vault/VaultView.js";
import { t } from "../../i18n/index.js";
import "./Dock.css";

interface DockProps {
  selected: PageCardWithCard | null;
  generating: boolean;
  /** Live text streamed so far from the Step 2 SSE preview endpoint, while generating. */
  streamingText?: string;
  onSave: () => void;
  onRemoveFromPage: () => void;
  onDeleteEntirely: () => void;
  onGenerate: () => void;
  /** Vault extension panel, toggled from the Dock (spec1.md Part 3 "Vault"). */
  vaultCards: Card[];
  vaultQuery: string;
  onVaultQueryChange: (q: string) => void;
  onCreateVaultCard: (title: string, content: string) => void;
  onDeleteVaultCard: (id: string) => void;
  /** Add a vault Card to the current Page, if one exists. */
  onAddVaultCardToPage: ((cardId: string) => void) | null;
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
 * Sticky footer, state-dependent (spec1.md Part 2 "The Dock" / Part 3 MVP spec):
 * nothing selected -> minimal state; a Card selected -> its Save/Generate/Remove/
 * Delete actions, reachable one-handed at the bottom of the screen. Text editing
 * happens inline on the Card itself (`Card.tsx`), not here.
 *
 * The action buttons shown are derived from the selected Card's CardType
 * (cardTypeRegistry) and the Operations it supports (operationRegistry) rather than a
 * fixed list — see supportedOperationIds above.
 */
export function Dock({
  selected,
  generating,
  streamingText,
  onSave,
  onRemoveFromPage,
  onDeleteEntirely,
  onGenerate,
  vaultCards,
  vaultQuery,
  onVaultQueryChange,
  onCreateVaultCard,
  onDeleteVaultCard,
  onAddVaultCardToPage,
}: DockProps) {
  const [vaultOpen, setVaultOpen] = useState(false);

  const vaultToggle = (
    <div className="dock__header">
      <Button onClick={() => setVaultOpen((open) => !open)}>
        {vaultOpen ? t("dock.vault.close") : t("dock.vault.open")}
      </Button>
    </div>
  );

  const vaultPanel = vaultOpen && (
    <div className="dock__vault-panel">
      <VaultView
        cards={vaultCards}
        query={vaultQuery}
        onQueryChange={onVaultQueryChange}
        onCreateCard={onCreateVaultCard}
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

  if (!selected) {
    return (
      <footer className="dock dock--empty">
        {vaultToggle}
        {vaultPanel}
        <span>{t("dock.empty")}</span>
      </footer>
    );
  }

  const title = selected.draftTitle ?? selected.card.title;
  const hasUnsavedDraft = selected.draftTitle !== null || selected.draftContent !== null;

  // Card has no `typeId` field yet (Step 3 only added `metadata` to it), and "note" is
  // currently the only registered CardType, so it's the only possible lookup today.
  // This is where a per-Card type selector would go once `typeId` exists.
  const available = supportedOperationIds("note");

  const actions: DockAction[] = [
    {
      key: "save",
      operationId: "card.save",
      label: t("dock.action.save"),
      onClick: onSave,
      disabled: !hasUnsavedDraft,
    },
    {
      key: "generate",
      operationId: "card.generate",
      label: generating ? t("dock.action.generating") : t("dock.action.generate"),
      onClick: onGenerate,
      disabled: generating,
    },
    { key: "remove", operationId: null, label: t("dock.action.remove"), onClick: onRemoveFromPage },
    {
      key: "delete",
      operationId: "card.delete",
      label: t("dock.action.delete"),
      onClick: onDeleteEntirely,
      danger: true,
    },
  ].filter((action) => action.operationId === null || available.has(action.operationId));

  return (
    <footer className="dock">
      {vaultToggle}
      {vaultPanel}
      <div className="dock__title">{title || t("common.untitled")}</div>
      {generating && streamingText && (
        <div className="dock__stream-preview">{streamingText}</div>
      )}
      <div className="dock__row">
        {actions.map((action) => (
          <Button
            key={action.key}
            variant={action.danger ? "danger" : "default"}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </footer>
  );
}
