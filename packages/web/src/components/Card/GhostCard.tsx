import { Fragment, createElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { GhostCardNode } from "../../hooks/useGeneration.js";
import { Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./Card.css";
import "./CardEmbed.css";
import "./CardContent.css";

interface GhostCardTreeProps {
  nodeId: number;
  nodes: Record<number, GhostCardNode>;
}

/** The exact tag allowlist the generate/selection/interactive system prompts are told
 *  to use (prompt-engine/prompts/generate/system.md rule 6) — anything else a model
 *  emits (a disallowed tag, or any attribute at all) is unwrapped to its own text
 *  content below, never rendered as a real element and never passed through
 *  `dangerouslySetInnerHTML`. This is the same "only known-safe markup ever becomes a
 *  real element" guarantee the saved Card gets from TipTap's own schema-filtered HTML
 *  parsing (richText/plainText.ts's htmlToDoc doc comment), just implemented directly
 *  here since a ghost card's streamed, possibly mid-tag text isn't a real editor
 *  document. */
const GHOST_ALLOWED_TAGS = new Set(["p", "strong", "em", "h1", "h2", "h3", "ul", "ol", "li"]);

let fragmentParser: DOMParser | null = null;

/** Turns one streamed text part into React elements, tag by allowlisted tag, so a
 *  ghost card in progress looks like what it becomes once saved (same rule 6 tag set)
 *  instead of showing raw `<strong>`/`<p>` characters for however long the generation
 *  is still streaming. DOMParser is lenient with incomplete markup — an unclosed tag
 *  at the very end of the text streamed so far just parses as still-open — so this
 *  degrades gracefully chunk to chunk rather than erroring on a mid-tag boundary. */
function renderGhostFragment(html: string, keyPrefix: string): ReactNode[] {
  if (!fragmentParser) fragmentParser = new DOMParser();
  const doc = fragmentParser.parseFromString(html, "text/html");
  return ghostDomChildrenToReact(doc.body.childNodes, keyPrefix);
}

function ghostDomChildrenToReact(nodes: NodeListOf<ChildNode>, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = [];
  nodes.forEach((node, i) => {
    const key = `${keyPrefix}-${i}`;
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) result.push(node.textContent);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const children = ghostDomChildrenToReact(el.childNodes, key);
    result.push(
      GHOST_ALLOWED_TAGS.has(tag)
        ? createElement(tag, { key }, ...children)
        : createElement(Fragment, { key }, ...children),
    );
  });
  return result;
}

/** Renders one ghost card node's parts — streamed text (now possibly carrying rule
 *  6's formatting tags, rendered live via renderGhostFragment above) interleaved with
 *  any nested ghost cards — with the same classes CardContent.tsx uses for a real
 *  Card, so a ghost card looks exactly like what it becomes once accepted. */
function GhostCardBody({ nodeId, nodes }: GhostCardTreeProps) {
  const node = nodes[nodeId];
  if (!node) return null;
  return (
    <div className="card__preview card__preview--embedded">
      {node.parts.map((part, i) =>
        part.kind === "text" ? (
          part.text.trim() && (
            <div key={i} className="card-content__text">
              {renderGhostFragment(part.text, `text-${i}`)}
            </div>
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
          {node.title && <span className="card__title">{node.title}</span>}
        </div>
      </div>
      {!folded && <GhostCardBody nodeId={nodeId} nodes={nodes} />}
    </div>
  );
}

/** The Page's own scrollable viewport (styles/global.css's `.app__main`, the sole
 *  `overflow-y: auto` ancestor everything else scrolls inside) — the ghost card grows
 *  taller as content streams in without this ever repainting the ancestor's layout on
 *  its own, so nothing scrolls to follow it by default. Without the effect below, a
 *  generation longer than what's already on screen just grows below the fold: it's
 *  still updating in real time (confirmed streaming end-to-end, network chunk to DOM
 *  text), but invisibly, which reads exactly like "nothing happens until it's done." */
const SCROLL_VIEWPORT_SELECTOR = ".app__main";
/** How close to the bottom (px) counts as "still following it" — matches the
 *  standard chat-log convention: keep autoscrolling while the reader hasn't
 *  deliberately scrolled away, stop the moment they do. */
const STICK_TO_BOTTOM_THRESHOLD = 96;

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
  // Whether the viewport was already scrolled to (near) the bottom the last time the
  // user touched its scroll position — read fresh on the "scroll" event below rather
  // than recomputed here, since by the time this component re-renders with new
  // content the container has already grown taller and "distance from bottom" would
  // always look large regardless of where the reader actually left it.
  const stickingRef = useRef(true);

  useEffect(() => {
    const viewport = document.querySelector<HTMLElement>(SCROLL_VIEWPORT_SELECTOR);
    if (!viewport) return;
    function handleScroll() {
      const distance = viewport!.scrollHeight - viewport!.scrollTop - viewport!.clientHeight;
      stickingRef.current = distance < STICK_TO_BOTTOM_THRESHOLD;
    }
    viewport.addEventListener("scroll", handleScroll);
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, []);

  // Runs after every render (streaming in new text, or a nested ghost card
  // opening/closing both count) — keeps the growing card's bottom edge in view for as
  // long as the reader hasn't scrolled away from it, same "stick to the bottom until
  // you scroll up" behavior a chat log uses. No dependency array: cheap enough to run
  // on each of these renders, and there's no single prop that summarizes "content
  // grew" better than "a render happened while this is still mounted."
  useLayoutEffect(() => {
    if (!stickingRef.current) return;
    const viewport = document.querySelector<HTMLElement>(SCROLL_VIEWPORT_SELECTOR);
    viewport?.scrollTo({ top: viewport.scrollHeight });
  });

  if (!node) return null;
  return (
    <div className="card-shell card-shell--selected card-shell--ghost">
      <div className="card__header">
        <div className="card__header-start">
          <span className="card__caret-btn card__caret-btn--static" aria-hidden="true">
            <Icon name="down" className="card__caret" />
          </span>
          {node.title && <span className="card__title">{node.title}</span>}
        </div>
      </div>
      <GhostCardBody nodeId={nodeId} nodes={nodes} />
    </div>
  );
}
