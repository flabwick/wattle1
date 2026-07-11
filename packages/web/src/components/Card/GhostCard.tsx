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
 *  instead of the cardStore, since nested cards are never their own DB entity. */
function GhostCardEmbed({ nodeId, nodes }: GhostCardTreeProps) {
  const node = nodes[nodeId];
  if (!node) return null;
  return (
    <div className="card-shell card-embed">
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

/**
 * The root ghost card: a generation streaming or awaiting review, held in local state
 * only (useGeneration.ts) — never written to a Page or the vault until the Dock's
 * Accept action. Fills in progressively as parse events arrive; any nested `<card>`
 * blocks in its content render as embedded sub-cards via GhostCardEmbed above.
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
