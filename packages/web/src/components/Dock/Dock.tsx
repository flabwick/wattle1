import { useRef, useState } from "react";
import type { Card, PageCardWithCard, PageWithCards } from "@wattle/shared";
import { cardTypeRegistry, operationRegistry } from "@wattle/shared";
import type { AnnotationProcess } from "../../api/client.js";
import { Button, Icon } from "../primitives/index.js";
import type { IconName } from "../primitives/Icon.js";
import { VaultView } from "../Vault/VaultView.js";
import { ProcessPicker } from "./ProcessPicker.js";
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
  /** True from the moment a generation starts until it's fully saved — there is no
   *  separate review/Accept step; while this is true the Generate action becomes a
   *  Stop action instead (see onStopGeneration below). */
  generating: boolean;
  /** Ends a streaming generation early and saves whatever's been generated so far,
   *  same as letting it finish naturally — see useGeneration.ts's `stop`. */
  onStopGeneration: () => void;
  /** Set once a generation stream ends in an error (bad credentials, network failure,
   *  malformed model output — see useGeneration.ts) rather than a valid root card.
   *  Shown as a dismissible banner instead of silently doing nothing. */
  generationError: string | null;
  onDismissGenerationError: () => void;
  /** A one-time, non-error notice after a generation lands that wasn't a clean finish
   *  — cut off by the model's token limit, or ended early via the Stop action (see
   *  useGeneration.ts's `notice`). Dismissible, same as the error banners, but styled
   *  neutrally rather than as a danger/error. */
  generationNotice: string | null;
  onDismissGenerationNotice: () => void;
  /** Set when a diff/footnote/highlight run, or an accept/reject/edit-text action,
   *  fails (useAnnotations.ts's `error`) — same dismissible-banner convention as
   *  generationError above, kept as its own prop rather than merged with it since
   *  they're two independent features that can each be mid-action at once. */
  annotationError: string | null;
  onDismissAnnotationError: () => void;
  onEdit: () => void;
  onSave: () => void;
  /** The diff/footnote/highlight processes (a separate, parallel system from
   *  Generate above — see annotationService.ts) — null when there's no Card/embed
   *  context to run one against (mirrors onGeneratePage's null-when-unavailable
   *  convention). Runs against the *whole* selected Card (root + any nested Cards);
   *  a text-selection-scoped run instead goes through SelectionMenu.tsx directly,
   *  not through the Dock at all. */
  onRunProcess: ((process: AnnotationProcess) => void) | null;
  /** True while a process run is streaming/awaiting its model response — disables
   *  the action and spins its icon, same convention as `generating` below. */
  processRunning: boolean;
  /** How many pending diff annotations the selected Card/embed currently has — the
   *  "Accept all diffs" action only appears once this is > 0. */
  pendingDiffCount: number;
  onAcceptAllDiffs: (() => void) | null;
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
  onStopGeneration,
  generationError,
  onDismissGenerationError,
  generationNotice,
  onDismissGenerationNotice,
  annotationError,
  onDismissAnnotationError,
  onEdit,
  onSave,
  onRunProcess,
  processRunning,
  pendingDiffCount,
  onAcceptAllDiffs,
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
  const [processPickerPos, setProcessPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processButtonRef = useRef<HTMLDivElement>(null);

  /** Shared by both the `selected` and `selectedEmbedId` branches below — a Card and
   *  an embedded Card get the same process/accept-all-diffs actions, same precedent
   *  as their existing Edit/Save/Remove set. Rendered specially in the row below
   *  (not a plain onClick) since "process" opens ProcessPicker anchored to its own
   *  button rather than firing immediately. */
  const processActions: DockAction[] = [
    ...(onRunProcess
      ? [
          {
            key: "process",
            operationId: null,
            icon: "annotate" as const,
            spin: processRunning,
            label: processRunning ? t("dock.action.processRunning") : t("dock.action.process"),
            // Computes a fixed viewport position from the button's own rect rather
            // than anchoring via CSS position:absolute — .dock__row scrolls
            // horizontally (overflow-x: auto), which clips an absolutely-positioned
            // popover that escapes upward even though it still "renders" (same
            // ancestor-overflow clipping behavior SelectionMenu.tsx's fixed
            // positioning already sidesteps for the same reason).
            onClick: () => {
              // TEMP DEBUG — remove once the annotation-run-doesn't-do-anything
              // issue is diagnosed.
              console.debug("[annot] Dock process button clicked", {
                hasRef: !!processButtonRef.current,
                processRunning,
              });
              setProcessPickerPos((open) => {
                if (open) {
                  console.debug("[annot] closing ProcessPicker");
                  return null;
                }
                const rect = processButtonRef.current?.getBoundingClientRect();
                if (!rect) {
                  console.debug("[annot] process button has no rect yet — picker will NOT open");
                  return null;
                }
                console.debug("[annot] opening ProcessPicker at", rect);
                return { left: rect.left, bottom: window.innerHeight - rect.top + 4 };
              });
            },
            disabled: processRunning,
          },
        ]
      : []),
    ...(onAcceptAllDiffs && pendingDiffCount > 0
      ? [
          {
            key: "acceptAllDiffs",
            operationId: null,
            icon: "done" as const,
            label: t("dock.action.acceptAllDiffs"),
            // TEMP DEBUG — remove once diagnosed.
            onClick: () => {
              console.debug("[annot] Dock accept-all-diffs button clicked", { pendingDiffCount });
              onAcceptAllDiffs();
            },
          },
        ]
      : []),
  ];

  const vaultLabel = vaultOpen ? t("dock.vault.close") : t("dock.vault.open");
  const vaultAction: DockAction = {
    key: "vault",
    operationId: null,
    icon: vaultOpen ? "close" : "vault",
    label: vaultLabel,
    onClick: () => setVaultOpen((open) => !open),
  };

  const vaultPanel = vaultOpen && !movingPageCardId && (
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
      ...processActions,
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
      ...processActions,
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
      // While generating, this becomes a Stop action instead of a disabled/spinning
      // Generate button — there's no review step any more, so the only thing left to
      // do mid-generation is let it run or cut it short (see useGeneration.ts's stop).
      ...(generating
        ? [
            {
              key: "stopGeneration",
              operationId: null,
              icon: "stop" as const,
              spin: true,
              label: t("dock.action.stopGeneration"),
              onClick: onStopGeneration,
            },
          ]
        : onGeneratePage
          ? [
              {
                key: "generatePage",
                operationId: null,
                icon: "generate" as const,
                label: t("dock.action.generate"),
                onClick: onGeneratePage,
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

  // While a Card is in transit (Move Mode), the Dock collapses to just a Cancel
  // action — no Vault toggle, no other Card/Page actions — so the only thing to do
  // is tap a drop target (PageStack.tsx) or back out.
  const actions: DockAction[] = movingPageCardId
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
      {generationNotice && (
        <div className="dock__notice-banner" role="status">
          <span className="dock__error-banner-text">{generationNotice}</span>
          <button
            type="button"
            className="dock__error-banner-dismiss"
            aria-label={t("dock.action.dismiss")}
            title={t("dock.action.dismiss")}
            onClick={onDismissGenerationNotice}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
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
      {annotationError && (
        <div className="dock__error-banner" role="alert">
          <span className="dock__error-banner-text">{annotationError}</span>
          <button
            type="button"
            className="dock__error-banner-dismiss"
            aria-label={t("dock.action.dismiss")}
            title={t("dock.action.dismiss")}
            onClick={onDismissAnnotationError}
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
        {actions.map((action) =>
          // "process" opens ProcessPicker anchored to its own button, rather than
          // firing an action directly — needs its own positioned wrapper, unlike
          // every other plain-click DockAction below.
          action.key === "process" ? (
            <div key="process" className="dock__process-wrap" ref={processButtonRef}>
              <Button
                iconOnly
                onClick={action.onClick}
                disabled={action.disabled}
                aria-label={action.label}
                title={action.label}
              >
                <Icon name={action.icon} spin={action.spin} />
              </Button>
            </div>
          ) : (
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
          ),
        )}
      </div>
      {processPickerPos && (
        <ProcessPicker
          style={{ left: processPickerPos.left, bottom: processPickerPos.bottom }}
          onPick={(process) => {
            setProcessPickerPos(null);
            onRunProcess?.(process);
          }}
          onClose={() => setProcessPickerPos(null)}
        />
      )}
    </footer>
  );
}
