import type { PageCardWithCard } from "@wattle/shared";
import "./Card.css";

interface CardProps {
  pageCard: PageCardWithCard;
  selected: boolean;
  onSelect: () => void;
}

/** A Card rendered inside a Page. Shows draft text if present, else the saved vault copy. */
export function CardView({ pageCard, selected, onSelect }: CardProps) {
  const title = pageCard.draftTitle ?? pageCard.card.title;
  const content = pageCard.draftContent ?? pageCard.card.content;
  const isDraft = pageCard.draftTitle !== null || pageCard.draftContent !== null;

  return (
    <button
      type="button"
      className={`card ${selected ? "card--selected" : ""}`}
      onClick={onSelect}
    >
      <div className="card__header">
        <span className="card__title">{title || "Untitled"}</span>
        {isDraft && <span className="card__badge">unsaved</span>}
      </div>
      <p className="card__preview">{content || "(empty)"}</p>
    </button>
  );
}
