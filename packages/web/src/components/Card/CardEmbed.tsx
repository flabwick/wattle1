import { useState } from "react";
import { Icon, InputField } from "../primitives/index.js";
import { useCard } from "../../hooks/useCard.js";
import { editCard } from "../../lib/cardStore.js";
import { t } from "../../i18n/index.js";
import { CardContent } from "./CardContent.js";
import { CardContentEditor } from "./CardContentEditor.js";
import "./CardEmbed.css";

/** Hard cap on nesting depth — a genuine cycle (A embeds B embeds A) is caught by
 *  `ancestorIds` below regardless of depth, this only bounds a long non-cyclical
 *  chain of distinct Cards each embedding the next. */
const MAX_EMBED_DEPTH = 4;

interface CardEmbedProps {
  cardId: string;
  ancestorIds: ReadonlySet<string>;
  depth: number;
  /** True while an ancestor Card — this embed, or whichever Card embeds it, at any
   *  depth — is itself being edited (Card.tsx's editing branch, via
   *  CardContentEditor.tsx). The embed always renders fully — same header, same
   *  content — whether or not this is set; the only thing it changes is whether that
   *  content is read-only (CardContent) or directly editable (CardContentEditor),
   *  cascading the same to any embeds nested inside *its* content, so editing a Card
   *  shows the edit state of everything embedded in it, all the way down (bounded by
   *  MAX_EMBED_DEPTH same as normal viewing). */
  forceEditing?: boolean;
}

/**
 * A `[[cardId]]` reference (lib/parseCardRefs.ts, inserted via CardLinkPicker.tsx)
 * rendered inline as the actual referenced Card, in full, always — same header/fold
 * chrome as a top-level Card (Card.tsx), never collapsed to a link/chip: viewing and
 * editing a Card look the same for anything embedded in it, just read-only vs.
 * editable.
 *
 * Reads and writes through the shared cardStore (useCard.ts) rather than its own
 * local state, so this Card stays in sync with *every* other place it's currently
 * shown — another embed of the same id elsewhere on the page, or the top-level
 * PageCard view if this Card is also open on a Page — the moment any one of them
 * edits it, not just on next reload. There's no page-local draft for an embed the
 * way there is for a PageCard: edits go straight to the vault.
 */
export function CardEmbed({ cardId, ancestorIds, depth, forceEditing = false }: CardEmbedProps) {
  const circular = ancestorIds.has(cardId);
  const tooDeep = depth > MAX_EMBED_DEPTH;

  const { card, state } = useCard(cardId);
  const [folded, setFolded] = useState(false);

  if (circular) {
    return <span className="card-embed__inline-note">{t("card.embed.circular")}</span>;
  }
  if (tooDeep) {
    return <span className="card-embed__inline-note">{t("card.embed.tooDeep")}</span>;
  }
  if (state === "loading") {
    return <span className="card-embed__inline-note">{t("card.embed.loading")}</span>;
  }
  if (state === "error" || !card) {
    return <span className="card-embed__inline-note">{t("card.embed.notFound")}</span>;
  }

  const childAncestorIds = new Set([...ancestorIds, cardId]);

  return (
    <div className="card-shell card-embed">
      <div className="card__header">
        <div className="card__header-start">
          <button
            type="button"
            className="card__caret-btn"
            aria-label={folded ? t("card.expand") : t("card.collapse")}
            title={folded ? t("card.expand") : t("card.collapse")}
            onClick={() => setFolded((f) => !f)}
          >
            <Icon name="down" className={`card__caret${folded ? " card__caret--collapsed" : ""}`} />
          </button>
          {forceEditing ? (
            <InputField
              className="card__title-input"
              value={card.title}
              placeholder={t("card.titlePlaceholder")}
              onChange={(e) => editCard(cardId, { title: e.target.value })}
            />
          ) : (
            <span className="card__title">{card.title || t("common.untitled")}</span>
          )}
        </div>
      </div>
      {!folded &&
        (forceEditing ? (
          <CardContentEditor
            content={card.content}
            onChangeContent={(next) => editCard(cardId, { content: next })}
            ancestorIds={childAncestorIds}
            depth={depth + 1}
          />
        ) : (
          <CardContent content={card.content} ancestorIds={childAncestorIds} depth={depth + 1} />
        ))}
    </div>
  );
}
