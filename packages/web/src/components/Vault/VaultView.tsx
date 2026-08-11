import { useEffect, useRef, useState } from "react";
import type { Card, PageSummary } from "@wattle/shared";
import { Icon, InputField } from "../primitives/index.js";
import { useVaultCardDetail } from "../../hooks/useVaultCardDetail.js";
import { VaultCardDetail } from "./VaultCardDetail.js";
import { t } from "../../i18n/index.js";
import "./VaultView.css";

interface VaultViewProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** Card title/content matches (spec1.md Part 3 "Vault") — with no query, every
   *  saved Card, most recently updated first (cardService.listCards's own default). */
  searchResults: Card[];
  /** Page title matches (Pages + Links + Search rebuild) — rendered above
   *  `searchResults`, since a Page hit is "go there", not "select and decide what to
   *  do" the way a Card hit is. With no query, every claimed Page (searchPages's own
   *  default — named, pinned, or linked from somewhere). */
  pageResults: PageSummary[];
  /** Open-on-hit — a Page result navigates immediately, no separate Dock action
   *  needed the way a Card's does. */
  onOpenPage: (id: string) => void;
  /** Every Home (Homes + Pages hierarchy, Phase 2) — shown only in the true
   *  zero-match empty state below, as somewhere to go instead of a dead end. */
  homes: PageSummary[];
  /** "Create Home" — the empty state's own escape hatch for when none of the
   *  existing Homes are what the user meant either. Deliberately only offered
   *  here, not as a standing button elsewhere — Create Home is meant to be rare. */
  onCreateHome: () => void;

  selectedCardId: string | null;
  /** A plain row click/tap — only ever selects (IDE-file-manager convention), never
   *  opens anything. What "open" even means for a Card is ambiguous on its own (add
   *  to Page? to the Dock? preview its links/Nearby?) — see Dock.tsx's
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

  /** Which Card is mid-rename, showing a text input in place of its title — set by
   *  the Dock's Rename action, not from within this view. */
  renamingId: string | null;
  /** True while `renamingId` is a Card just created by the "New Card" action,
   *  naming it for the very first time — its rename input starts blank (never
   *  pre-filled with a placeholder title the user never actually chose). Never true
   *  for an already-named Card being renamed normally. */
  renamingIsNewCard: boolean;
  onCommitRename: (title: string) => void;
  onCancelRename: () => void;
}

/** A Card row's title, either static or (while `renamingId === id`) an inline
 *  rename input. */
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
    return <span className="vault__item-title">{title}</span>;
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
 *  Card/Upload, and whatever's selected) lives in the Dock's own row underneath
 *  instead (Dock.tsx's vaultModeActions) — this panel stays a plain, quiet list. */
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
 * The vault, reframed as pure search (Pages + Links + Search rebuild) — no folder
 * tree, no browsing: a search box over every Page (by title) and Card (by title/
 * content), Page hits above Card hits. A blank query isn't an empty state either —
 * it's just the widest possible search, so there's always something here rather
 * than a "type to begin" prompt. A single click on a Card row only *selects* it,
 * exactly like an IDE's own file list: nothing opens on its own. The Dock then
 * shows what to do with it — Add to Page, Add to Dock, Preview (links + Nearby),
 * Rename, Delete — see Dock.tsx's vaultModeActions. A Page row is different:
 * there's only one sensible thing to do with it (go there), so it navigates on the
 * first click.
 */
export function VaultView({
  query,
  onQueryChange,
  searchResults,
  pageResults,
  onOpenPage,
  homes,
  onCreateHome,
  selectedCardId,
  onSelectCard,
  detailCardId,
  onOpenCardDetail,
  onCloseCardDetail,
  renamingId,
  renamingIsNewCard,
  onCommitRename,
  onCancelRename,
}: VaultViewProps) {
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

      {pageResults.length > 0 && (
        <ul className="vault__list vault__list--pages">
          {pageResults.map((page) => (
            <li key={page.id} className="vault__item">
              <button type="button" className="vault__item-open" onClick={() => onOpenPage(page.id)}>
                <Icon name="pages" className="vault__item-icon" />
                <span className="vault__item-title">{page.title || page.preview}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="vault__list">
        {searchResults.map((card) => (
          <li key={card.id} className="vault__item">
            <button
              type="button"
              className={`vault__item-open${selectedCardId === card.id ? " vault__item-open--selected" : ""}`}
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

        {searchResults.length === 0 && pageResults.length === 0 && (
          <>
            <li className="vault__empty">{t("vault.empty")}</li>
            {homes.map((home) => (
              <li key={home.id} className="vault__item">
                <button type="button" className="vault__item-open" onClick={() => onOpenPage(home.id)}>
                  <Icon name="home" className="vault__item-icon" />
                  <span className="vault__item-title">{home.title || home.preview}</span>
                </button>
              </li>
            ))}
            <li className="vault__item">
              <button type="button" className="vault__item-open" onClick={onCreateHome}>
                <Icon name="plus" className="vault__item-icon" />
                <span className="vault__item-title">{t("vault.createHome")}</span>
              </button>
            </li>
          </>
        )}
      </ul>
    </div>
  );
}
