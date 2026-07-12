import { useEffect, useRef, useState } from "react";
import type { Card, Folder } from "@wattle/shared";
import { Button, Icon, InputField } from "../primitives/index.js";
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

  /**
   * Create a new Card directly in the vault, in whichever Folder is currently open —
   * an IDE "new file" affordance like the old page-oriented one this replaces: no
   * title/content form, it just appears ready to act on. Null (hides the action) if
   * search is active (there's no single folder to create into).
   */
  onCreateCard: (() => void) | null;
  onCreateFolder: (() => void) | null;

  selectedCardId: string | null;
  onSelectCard: (id: string) => void;
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
  onCommitRename,
  onCancelRename,
}: {
  id: string;
  title: string;
  renamingId: string | null;
  onCommitRename: (title: string) => void;
  onCancelRename: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(title);
  const renaming = renamingId === id;

  useEffect(() => {
    if (renaming) {
      setDraft(title);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset the draft
    // when this row *becomes* the one being renamed, not on every `title` change.
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

/**
 * The vault, styled as a compact file explorer: a breadcrumb over folders-then-cards,
 * or a flat search list. A single click on any row — Folder or Card — only *selects*
 * it, so the Dock can show what to do with it (add to page, rename, move, delete,
 * ...) rather than acting on it immediately (see Dock.tsx's vault selection model).
 * Opening a Folder (navigating into it) is a deliberately separate gesture — double-
 * click, or its row's chevron button — so a Folder can be renamed/moved/deleted
 * without having to step into it first.
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
  onCreateCard,
  onCreateFolder,
  selectedCardId,
  onSelectCard,
  selectedFolderId,
  onSelectFolder,
  renamingId,
  onCommitRename,
  onCancelRename,
  moving,
  onPickMoveTarget,
}: VaultViewProps) {
  const searching = query.length > 0;
  const movingFolderIntoItself = moving?.type === "folder" && moving.id === folder?.id;

  return (
    <div className="vault">
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
        {onCreateFolder && (
          <Button
            iconOnly
            aria-label={t("vault.createFolder")}
            title={t("vault.createFolder")}
            onClick={onCreateFolder}
          >
            <Icon name="folder" />
          </Button>
        )}
        {onCreateCard && (
          <Button
            iconOnly
            variant="primary"
            aria-label={t("vault.create")}
            title={t("vault.create")}
            onClick={onCreateCard}
          >
            <Icon name="plus" />
          </Button>
        )}
      </div>

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
