import { useEffect, useRef, useState } from "react";
import type { Card, Folder } from "@wattle/shared";
import { Button, Icon, InputField } from "../primitives/index.js";
import { useVaultCardDetail } from "../../hooks/useVaultCardDetail.js";
import { VaultCardDetail } from "./VaultCardDetail.js";
import { t } from "../../i18n/index.js";
import "./VaultView.css";

interface VaultViewProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** Flat search results (spec1.md Part 3 "Vault") — shown instead of `subfolders`/
   *  `cards` whenever `query` is non-empty. Search ignores folder boundaries. */
  searchResults: Card[];

  /** The currently browsed Folder, or null at the vault root. */
  folder: Folder | null;
  /** Root-to-parent ancestor chain of `folder`, for the breadcrumb. */
  breadcrumb: Folder[];
  subfolders: Folder[];
  /** Cards directly inside `folder` (or the root, if `folder` is null). */
  cards: Card[];
  /** Navigates into a Folder (or back to the vault root, for `null`) — distinct from
   *  *selecting* one (see onSelectFolder below): breadcrumb ancestor crumbs, a Folder
   *  row's chevron button, and double-clicking a Folder row all open it this way. */
  onOpenFolder: (id: string | null) => void;

  selectedCardId: string | null;
  /** A plain row click/tap — only ever selects (IDE-file-manager convention), never
   *  opens anything. What "open" even means for a Card is ambiguous on its own
   *  (add to Page? to the Dock? preview its links/Nearby?) — see Dock.tsx's
   *  vaultModeActions for the explicit actions selecting one surfaces instead. */
  onSelectCard: (id: string) => void;
  /** Non-null while the selected Card's click-through detail view (links + Nearby)
   *  is open — set only by the Dock's own explicit "Preview" action, never by
   *  selection alone. Null hides VaultCardDetail entirely, back to the plain list. */
  detailCardId: string | null;
  /** A link/Nearby row *within* the open detail view, drilling into another Card —
   *  distinct from onSelectCard: this also keeps the detail view open on the new
   *  Card, so following a chain of links stays one click each. */
  onOpenCardDetail: (id: string) => void;
  /** Closes the click-through detail view (back to the list/search results),
   *  leaving the Card itself still selected — same as closing a preview pane in a
   *  file manager doesn't deselect the file. */
  onCloseCardDetail: () => void;
  /** A selected Folder — a single click on a Folder row (or on the breadcrumb's
   *  trailing "current folder" crumb, which does nothing else) selects it *without*
   *  navigating, so the Dock can show Rename/Move/Delete for it — see Dock.tsx's
   *  vaultModeActions. Selecting is otherwise identical whether the Folder is one of
   *  `subfolders` or is `folder` itself (the one currently browsed). */
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;

  /** Which row (a Card or Folder id) is mid-rename, showing a text input in place of
   *  its label — set by the Dock's Rename action, not from within this view. */
  renamingId: string | null;
  /** True while `renamingId` is a Card just created by the "New Card" action,
   *  naming it for the very first time — its rename input starts blank (never
   *  pre-filled with a placeholder title the user never actually chose), and
   *  submitting it blank deletes the Card instead of reverting to that placeholder
   *  (see Dock.tsx's onCommitRename/onCancelRename). Never true for a Folder or an
   *  already-named Card being renamed normally. */
  renamingIsNewCard: boolean;
  onCommitRename: (title: string) => void;
  onCancelRename: () => void;

  /** Non-null while the Dock's Move action has a Card/Folder "in transit" waiting for
   *  a destination — folder rows stay click-to-navigate (so the target can be several
   *  levels deep), and a "Move Here" row targets whatever folder is currently open,
   *  mirroring PageStack.tsx's drop-zone Move Mode. */
  moving: { type: "card" | "folder"; id: string } | null;
  onPickMoveTarget: () => void;
}

/** A file-list row's label, either static or (while `renamingId === id`) an inline
 *  rename input — shared by both Folder and Card rows below. */
function ItemLabel({
  id,
  title,
  renamingId,
  startBlank,
  onCommitRename,
  onCancelRename,
}: {
  id: string;
  title: string;
  renamingId: string | null;
  /** Starts the rename input blank instead of pre-filled with `title` — a brand new
   *  Card's placeholder title was never a real choice the user made, so it
   *  shouldn't appear as text to delete before typing a real one. */
  startBlank?: boolean;
  onCommitRename: (title: string) => void;
  onCancelRename: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(title);
  const renaming = renamingId === id;

  useEffect(() => {
    if (renaming) {
      setDraft(startBlank ? "" : title);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset the draft
    // when this row *becomes* the one being renamed, not on every `title`/`startBlank`
    // change.
  }, [renaming]);

  if (!renaming) {
    return <span className="vault__item-title">{title || t("common.untitled")}</span>;
  }

  return (
    <input
      ref={inputRef}
      className="vault__item-rename"
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommitRename(draft);
        if (e.key === "Escape") onCancelRename();
      }}
      onBlur={() => onCommitRename(draft)}
    />
  );
}

/** The toolbar row — just a search field, full width. Every other action (New
 *  Folder/New Card/Upload, and whatever's selected) lives in the Dock's own row
 *  underneath instead (Dock.tsx's vaultModeActions) — this panel stays a plain,
 *  quiet list. */
function SearchBar({ query, onQueryChange }: { query: string; onQueryChange: (q: string) => void }) {
  return (
    <div className="vault__toolbar">
      <div className="vault__search-wrap">
        <Icon name="search" className="vault__search-icon" />
        <InputField
          className="vault__search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("vault.searchPlaceholder")}
        />
      </div>
    </div>
  );
}

/**
 * The vault, styled as a compact file explorer: a breadcrumb over folders-then-cards,
 * or a flat search list. A single click on any row — Folder or Card — only *selects*
 * it, exactly like an IDE's own file tree: nothing opens on its own. The Dock then
 * shows what to do with it — Add to Page, Add to Dock, Preview (links + Nearby),
 * Rename, Move, Delete — see Dock.tsx's vaultModeActions. Opening a Folder
 * (navigating into it) is a deliberately separate gesture — double-click, or its
 * row's chevron button — so a Folder can be renamed/moved/deleted without having to
 * step into it first.
 */
export function VaultView({
  query,
  onQueryChange,
  searchResults,
  folder,
  breadcrumb,
  subfolders,
  cards,
  onOpenFolder,
  selectedCardId,
  onSelectCard,
  detailCardId,
  onOpenCardDetail,
  onCloseCardDetail,
  selectedFolderId,
  onSelectFolder,
  renamingId,
  renamingIsNewCard,
  onCommitRename,
  onCancelRename,
  moving,
  onPickMoveTarget,
}: VaultViewProps) {
  const searching = query.length > 0;
  const movingFolderIntoItself = moving?.type === "folder" && moving.id === folder?.id;
  const cardDetail = useVaultCardDetail(detailCardId);

  if (detailCardId && cardDetail.card) {
    return (
      <div className="vault">
        <SearchBar query={query} onQueryChange={onQueryChange} />
        <VaultCardDetail
          card={cardDetail.card}
          links={cardDetail.links}
          nearbyItems={cardDetail.nearbyItems}
          loading={cardDetail.loading}
          onOpenCard={onOpenCardDetail}
          onBack={onCloseCardDetail}
        />
      </div>
    );
  }

  return (
    <div className="vault">
      <SearchBar query={query} onQueryChange={onQueryChange} />

      {!searching && folder && (
        <div className="vault__breadcrumb">
          <button type="button" className="vault__crumb" onClick={() => onOpenFolder(null)}>
            {t("vault.root")}
          </button>
          {breadcrumb.map((crumb) => (
            <span key={crumb.id}>
              <span className="vault__crumb-sep">/</span>
              <button type="button" className="vault__crumb" onClick={() => onOpenFolder(crumb.id)}>
                {crumb.title || t("common.untitled")}
              </button>
            </span>
          ))}
          <span className="vault__crumb-sep">/</span>
          <button
            type="button"
            className={`vault__crumb vault__crumb--current${
              selectedFolderId === folder.id ? " vault__crumb--selected" : ""
            }`}
            onClick={() => onSelectFolder(folder.id)}
          >
            <ItemLabel
              id={folder.id}
              title={folder.title}
              renamingId={renamingId}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
            />
          </button>
        </div>
      )}

      <ul className="vault__list">
        {moving && (
          <li className="vault__item">
            <button
              type="button"
              className="vault__move-target"
              disabled={movingFolderIntoItself}
              onClick={onPickMoveTarget}
            >
              <Icon name="done" className="vault__item-icon" />
              <span className="vault__item-title">{t("vault.moveHere")}</span>
            </button>
          </li>
        )}

        {!searching &&
          subfolders.map((f) => (
            <li key={f.id} className="vault__item">
              <button
                type="button"
                className={`vault__item-open${selectedFolderId === f.id ? " vault__item-open--selected" : ""}`}
                disabled={!!moving}
                onClick={() => onSelectFolder(f.id)}
                onDoubleClick={() => onOpenFolder(f.id)}
              >
                <Icon name="folder" className="vault__item-icon" />
                <ItemLabel
                  id={f.id}
                  title={f.title}
                  renamingId={renamingId}
                  onCommitRename={onCommitRename}
                  onCancelRename={onCancelRename}
                />
              </button>
              <Button
                iconOnly
                className="vault__item-chevron"
                aria-label={t("vault.open")}
                title={t("vault.open")}
                onClick={() => onOpenFolder(f.id)}
              >
                <Icon name="chevronRight" />
              </Button>
            </li>
          ))}

        {(searching ? searchResults : cards).map((card) => (
          <li key={card.id} className="vault__item">
            <button
              type="button"
              className={`vault__item-open${selectedCardId === card.id ? " vault__item-open--selected" : ""}`}
              disabled={!!moving}
              onClick={() => onSelectCard(card.id)}
            >
              <Icon name="file" className="vault__item-icon" />
              <ItemLabel
                id={card.id}
                title={card.title}
                renamingId={renamingId}
                startBlank={renamingIsNewCard}
                onCommitRename={onCommitRename}
                onCancelRename={onCancelRename}
              />
            </button>
          </li>
        ))}

        {searching && searchResults.length === 0 && <li className="vault__empty">{t("vault.empty")}</li>}
        {!searching && subfolders.length === 0 && cards.length === 0 && (
          <li className="vault__empty">{t("vault.emptyFolder")}</li>
        )}
      </ul>
    </div>
  );
}
