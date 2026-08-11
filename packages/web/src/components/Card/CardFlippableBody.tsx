import type { ReactNode } from "react";
import type { Card, PageCardWithCard } from "@wattle/shared";
import { CardInfoPanel } from "./CardInfoPanel.js";

/**
 * The flip mechanic CardHeaderActions' own info button drives — same "front is the
 * real content, back is CardInfoPanel" split Card.tsx's own `card__flip`/`card__face`
 * markup uses, factored out so every other registered CardType's View can flip too
 * without duplicating it. `card__flip`/`card__face*` are plain classes in Card.css,
 * already imported by every View file that would use this.
 */
export function CardFlippableBody({
  card,
  showingInfo,
  pageSiblings,
  excludePageCardId,
  onChangeTitle,
  children,
}: {
  card: Card;
  showingInfo: boolean;
  /** Forwarded straight to CardInfoPanel — only its "action" CardType Actions
   *  section (a cardPicker field's own "pick a card on this page" selector) needs
   *  this; every other CardType's back face just ignores it. */
  pageSiblings?: PageCardWithCard[];
  /** This Card's own PageCard id, filtered out of that same selector — a job's own
   *  target is always a specific *other* card, never the action Card itself. */
  excludePageCardId?: string;
  /** Renders an editable title field on the info face (Card design pass: title
   *  editing moved off the header) — forwarded straight to CardInfoPanel. Omitted
   *  entirely by a caller with nothing to write it through (most typed Views
   *  already rename via their own Editor instead). */
  onChangeTitle?: (title: string) => void;
  children: ReactNode;
}) {
  return (
    <div className={`card__flip${showingInfo ? " card__flip--flipped" : ""}`}>
      <div className={`card__face card__face--front${showingInfo ? " card__face--hidden" : ""}`}>{children}</div>
      <div className={`card__face card__face--back${showingInfo ? "" : " card__face--hidden"}`}>
        <CardInfoPanel
          card={card}
          pageSiblings={pageSiblings}
          excludePageCardId={excludePageCardId}
          onChangeTitle={onChangeTitle}
        />
      </div>
    </div>
  );
}
