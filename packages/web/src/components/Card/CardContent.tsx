import { parseCardRefs } from "../../lib/parseCardRefs.js";
import { CardEmbed } from "./CardEmbed.js";
import { t } from "../../i18n/index.js";
import "./CardContent.css";

interface CardContentProps {
  content: string;
  ancestorIds: ReadonlySet<string>;
  depth: number;
  /** Which embedded Card, if any, is independently selected right now (App.tsx state)
   *  — compared against each "ref" segment's cardId to decide whether that particular
   *  CardEmbed should render selected. Only meaningful in the read-only render path;
   *  the forceEditing/CardContentEditor path is untouched by embed selection. */
  selectedEmbedId?: string | null;
  /** Selects (or re-selects to toggle off) an embedded Card independently of whatever
   *  top-level Card contains it — see CardEmbed.tsx and Dock.tsx's embed-selected
   *  action row. `onRemove` strips just that one `[[cardId]]` token back out of
   *  *this* content string, leaving the rest — the Dock's Remove action calls it. */
  onSelectEmbed?: (cardId: string, onRemove: () => void) => void;
  /** Persists an edited version of this exact content string back to whatever owns
   *  it (a top-level Card.tsx's handleContentChange, or a nested CardEmbed's own
   *  editCard call) — only used to splice out a removed embed's token, since this
   *  component is otherwise read-only. */
  onChangeContent?: (next: string) => void;
}

/**
 * Renders a Card's raw content, expanding any `[[cardId]]` tokens (lib/parseCardRefs.ts)
 * into live CardEmbed widgets inline. Plain content (the common case, no refs) renders
 * exactly as before — a single clamped `<p className="card__preview">` — so nothing
 * changes visually for Cards that don't embed anything.
 */
export function CardContent({
  content,
  ancestorIds,
  depth,
  selectedEmbedId,
  onSelectEmbed,
  onChangeContent,
}: CardContentProps) {
  const segments = parseCardRefs(content);
  const hasRefs = segments.some((segment) => segment.type === "ref");

  if (!hasRefs) {
    return <p className="card__preview">{content || t("card.emptyContent")}</p>;
  }

  return (
    <div className="card__preview card__preview--embedded">
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          segment.value.trim() && (
            <p key={i} className="card-content__text">
              {segment.value}
            </p>
          )
        ) : (
          <CardEmbed
            key={i}
            cardId={segment.cardId}
            ancestorIds={ancestorIds}
            depth={depth}
            selectedEmbedId={selectedEmbedId}
            onSelectEmbed={onSelectEmbed}
            onRemoveSelf={
              onChangeContent
                ? () => onChangeContent(content.slice(0, segment.start) + content.slice(segment.end))
                : undefined
            }
          />
        ),
      )}
    </div>
  );
}
