import { useState } from "react";
import type { Card } from "@wattle/shared";
import "./VaultView.css";

interface VaultViewProps {
  cards: Card[];
  query: string;
  onQueryChange: (q: string) => void;
  onCreateCard: (title: string, content: string) => void;
  onDeleteCard: (id: string) => void;
  /** Open a vault Card into the topmost Page, if one exists. */
  onOpenIntoTopPage: ((cardId: string) => void) | null;
}

/** The flat vault list + search (spec1.md Part 3 "Vault"). */
export function VaultView({
  cards,
  query,
  onQueryChange,
  onCreateCard,
  onDeleteCard,
  onOpenIntoTopPage,
}: VaultViewProps) {
  const [newTitle, setNewTitle] = useState("");

  return (
    <div className="vault">
      <input
        className="vault__search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search title or text…"
      />

      <form
        className="vault__new"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newTitle.trim()) return;
          onCreateCard(newTitle.trim(), "");
          setNewTitle("");
        }}
      >
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New Card title…"
        />
        <button type="submit">Create</button>
      </form>

      <ul className="vault__list">
        {cards.map((card) => (
          <li key={card.id} className="vault__item">
            <div className="vault__item-body">
              <div className="vault__item-title">{card.title || "Untitled"}</div>
              <div className="vault__item-preview">{card.content.slice(0, 120)}</div>
            </div>
            <div className="vault__item-actions">
              {onOpenIntoTopPage && (
                <button type="button" onClick={() => onOpenIntoTopPage(card.id)}>
                  Open
                </button>
              )}
              <button type="button" className="vault__danger" onClick={() => onDeleteCard(card.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {cards.length === 0 && <li className="vault__empty">No Cards match.</li>}
      </ul>
    </div>
  );
}
