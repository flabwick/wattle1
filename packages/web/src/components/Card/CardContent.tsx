import { parseCardRefs } from "../../lib/parseCardRefs.js";
import { CardEmbed } from "./CardEmbed.js";
import { t } from "../../i18n/index.js";
import "./CardContent.css";

interface CardContentProps {
  content: string;
  ancestorIds: ReadonlySet<string>;
  depth: number;
}

/**
 * Renders a Card's raw content, expanding any `[[cardId]]` tokens (lib/parseCardRefs.ts)
 * into live CardEmbed widgets inline. Plain content (the common case, no refs) renders
 * exactly as before — a single clamped `<p className="card__preview">` — so nothing
 * changes visually for Cards that don't embed anything.
 */
export function CardContent({ content, ancestorIds, depth }: CardContentProps) {
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
          <CardEmbed key={i} cardId={segment.cardId} ancestorIds={ancestorIds} depth={depth} />
        ),
      )}
    </div>
  );
}
