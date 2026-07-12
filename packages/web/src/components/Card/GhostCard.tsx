import { useEffect, useState } from "react";
import type { GhostCardNode } from "../../hooks/useGeneration.js";
import { Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./Card.css";
import "./CardEmbed.css";

interface GhostCardTreeProps {
  nodeId: number;
  nodes: Record<number, GhostCardNode>;
}

/** Renders one ghost card node's parts — literal streamed text interleaved with any
 *  nested ghost cards — with the same classes CardContent.tsx uses for a real Card, so
 *  a ghost card looks exactly like what it becomes once accepted. */
function GhostCardBody({ nodeId, nodes }: GhostCardTreeProps) {
  const node = nodes[nodeId];
  if (!node) return null;
  return (
    <div className="card__preview card__preview--embedded">
      {node.parts.map((part, i) =>
        part.kind === "text" ? (
          part.text.trim() && (
            <p key={i} className="card-content__text">
              {part.text}
            </p>
          )
        ) : (
          <GhostCardEmbed key={i} nodeId={part.id} nodes={nodes} />
        ),
      )}
    </div>
  );
}

/** A nested `<card>` block, rendered inline as its own embedded card — same chrome as
 *  CardEmbed.tsx (a saved-Card `[[ref]]` embed), just backed by local ghost-card state
 *  instead of the cardStore, since nested cards are never their own DB entity.
 *
 * Auto-folds the moment its closing `</card>` tag arrives (node.closed flips true) —
 * once a nested card's content is fully generated there's nothing left to watch
 * stream in, so collapsing it keeps attention on whatever's still actively
 * generating instead of a growing list of finished sub-cards. Still manually
 * re-openable via the caret, same as a real CardEmbed, in case you want to check it
 * before accepting the generation.
 */
function GhostCardEmbed({ nodeId, nodes }: GhostCardTreeProps) {
  const node = nodes[nodeId];
  const [folded, setFolded] = useState(false);

  useEffect(() => {
    if (node?.closed) setFolded(true);
  }, [node?.closed]);

  if (!node) return null;
  return (
    <div className="card-shell card-embed">
      <div className="card__header">
        <div className="card__header-start">
          <button
            type="button"
            className="card__caret-btn"
            aria-label={folded ? t("card.expand") : t("card.collapse")}
            title={folded ? t("card.expand") : t("card.collapse")}
            onClick={(e) => {
              e.stopPropagation();
              setFolded((f) => !f);
            }}
          >
            <Icon name="down" className={`card__caret${folded ? " card__caret--collapsed" : ""}`} />
          </button>
          <span className="card__title">{node.title || t("common.untitled")}</span>
        </div>
      </div>
      {!folded && <GhostCardBody nodeId={nodeId} nodes={nodes} />}
    </div>
  );
}

/**
 * The root ghost card: a generation actively streaming in, held in local state only
 * (useGeneration.ts) until the stream ends — at which point it's saved immediately as
 * a real Card, no separate review/Accept step. Fills in progressively as parse events
 * arrive; any nested `<card>` blocks in its content render as embedded sub-cards via
 * GhostCardEmbed above. A cut-off-or-stopped generation is still saved the same way;
 * that's surfaced afterward as a Dock notice (App.tsx/useGeneration.ts's `notice`),
 * not shown here, since this component is gone (replaced by the real, saved Card) by
 * the time there'd be anything to show.
 */
export function GhostCard({ nodeId, nodes }: GhostCardTreeProps) {
  const node = nodes[nodeId];
  if (!node) return null;
  return (
    <div className="card-shell card-shell--selected card-shell--ghost">
      <div className="card__header">
        <div className="card__header-start">
          <span className="card__caret-btn card__caret-btn--static" aria-hidden="true">
            <Icon name="down" className="card__caret" />
          </span>
          <span className="card__title">{node.title || t("common.untitled")}</span>
        </div>
      </div>
      <GhostCardBody nodeId={nodeId} nodes={nodes} />
    </div>
  );
}
