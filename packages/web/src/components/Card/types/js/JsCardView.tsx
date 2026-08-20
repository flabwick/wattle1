import { useEffect, useRef, useState } from "react";
import { CardShell } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { buildSandboxHtml } from "../../../../lib/wattleSandboxBootstrap.js";
import { readSandboxThemeTokens } from "../../../../lib/wattleSandboxTheme.js";
import { handleWattleRpcCall, wattleCallMayChangeOwnPage, type WattleSdkHostContext } from "../../../../lib/wattleSdkHost.js";
import { CardHeaderStart } from "../../CardHeaderStart.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./JsCard.css";

interface WattleJsMessage {
  wattleJs: true;
  type: "call" | "error" | "done" | "resize";
  id?: string;
  method?: string;
  args?: unknown[];
  message?: string;
  height?: number;
}

/** Height (px) a fresh iframe starts at before it's had a chance to report its
 *  own real size (wattleSandboxBootstrap.ts's own ResizeObserver loop) — small
 *  enough that a brief empty/loading script doesn't flash a tall blank box. */
const INITIAL_IFRAME_HEIGHT = 24;

/**
 * The "js" CardType's render — always live: the Card's own `metadata.js.source`
 * runs inside a sandboxed iframe the moment this View is on screen, exactly the
 * DataviewJS-style live-query model the plan calls for. Editing the script
 * itself happens in the info face (CardInfoPanel.tsx's own Script section,
 * Apply) or JsCardEditor.tsx (double-click) — this component only ever runs
 * it, never writes to it, except through whatever `wattle.*` mutations the
 * script itself calls via a handler.
 *
 * Two distinct re-run paths, deliberately not the same mechanism:
 * - The script's own source changing (Apply/Generate) hands the iframe a new
 *   `srcdoc` value, which is a real browser navigation — unavoidable, since
 *   the code itself is different now, and correctly resets everything
 *   (fieldValues included).
 * - The current Page's own card list changing (a reorder, an add/remove
 *   elsewhere on the page — anything `wattle.page.cards()` would see
 *   differently) instead posts a lightweight "rerun" message into the SAME,
 *   already-loaded iframe (wattleSandboxBootstrap.ts's own `runMain`) — no
 *   navigation, no reload flash, `fieldValues` untouched. This is what keeps
 *   a page-full of JS cards from visibly flickering every time something
 *   elsewhere on the page moves.
 */
export function JsCardView({
  pageCard,
  selected,
  onSelect,
  onRequestEdit,
  onRunActionJob,
  pageSiblings,
  onRemove,
  onTurnIntoStack,
  onSendToDock,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const source = canonicalCard.metadata.js?.source ?? "";
  const [showingInfo, setShowingInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState(INITIAL_IFRAME_HEIGHT);
  const shellRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Consumed by the pageCardsKey effect further down; set from inside the
  // message-listener effect above it (a call that may change this page's own
  // card list sets it before the mutation even resolves) — declared up here,
  // ahead of both, so neither effect closure is stale about it.
  const skipNextPageCardsRerun = useRef(true);

  const hostCtx: WattleSdkHostContext = {
    pageCard,
    pageSiblings,
    onRunActionJob: onRunActionJob ?? (async () => undefined),
  };

  // The message listener itself only ever needs setting up once: the iframe
  // element never unmounts/remounts on its own any more (no `key` bump — see
  // this component's own doc comment above), and `iframe.contentWindow` is
  // read fresh on every message regardless of how many times the document
  // underneath it has actually navigated, so there's nothing here that goes
  // stale across a source-triggered reload.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframe?.contentWindow) return;
      const data = event.data as WattleJsMessage | undefined;
      if (!data || data.wattleJs !== true) return;
      if (data.type === "resize") {
        if (typeof data.height === "number") setIframeHeight(Math.max(data.height, INITIAL_IFRAME_HEIGHT));
        return;
      }
      if (data.type === "done") {
        setError(null);
        return;
      }
      if (data.type === "error") {
        setError(data.message ?? t("jsCard.error.generic"));
        return;
      }
      if (data.type === "call" && data.id && data.method) {
        const callId = data.id;
        if (wattleCallMayChangeOwnPage(hostCtx, data.method, data.args ?? [])) {
          skipNextPageCardsRerun.current = true;
        }
        handleWattleRpcCall(hostCtx, data.method, data.args ?? [])
          .then((result) => {
            iframe.contentWindow?.postMessage({ wattleJs: true, type: "result", id: callId, ok: true, result }, "*");
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            iframe.contentWindow?.postMessage({ wattleJs: true, type: "result", id: callId, ok: false, error: message }, "*");
          });
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; see the
    // comment above on why this never needs to re-run.
  }, []);

  // Resets error/height state whenever the script itself actually reloads —
  // mount, and any later source change (Apply/Generate) — never for the
  // page-cards rerun path below, which reuses the same run in place.
  useEffect(() => {
    setError(null);
    setIframeHeight(INITIAL_IFRAME_HEIGHT);
  }, [source]);

  // The lightweight rerun path: posts straight into the already-loaded iframe
  // rather than touching `srcdoc`. Skips its own first invocation (the mount
  // above already covers the very first load) so this never double-fires a
  // run at startup — and skips one more whenever the message-listener effect
  // above just flagged that this exact change was self-caused (see
  // wattleCallMayChangeOwnPage's own doc comment).
  const pageCardsKey = (pageSiblings ?? []).map((pc) => pc.id).join(",");
  useEffect(() => {
    if (skipNextPageCardsRerun.current) {
      skipNextPageCardsRerun.current = false;
      return;
    }
    iframeRef.current?.contentWindow?.postMessage({ wattleJs: true, type: "rerun" }, "*");
  }, [pageCardsKey]);

  const srcDoc = buildSandboxHtml(source, readSandboxThemeTokens(shellRef.current), canonicalCard.id);
  const isHidden = Boolean(pageCard.card.metadata.hidden);

  return (
    <CardShell ref={shellRef} selected={selected} className={isHidden ? "card-shell--hidden" : undefined} onDoubleClick={onRequestEdit}>
      <div className="card__header" onClick={onSelect}>
        <CardHeaderStart title={canonicalCard.title} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
        <CardHeaderActions
          onTurnIntoStack={onTurnIntoStack && (() => onTurnIntoStack(pageCard.id))}
          onSendToDock={onSendToDock && (() => onSendToDock(pageCard.id))}
          onRemove={() => onRemove?.(pageCard.id)}
          showingInfo={showingInfo}
          onToggleInfo={() => setShowingInfo((v) => !v)}
        />
      </div>
      {!collapsed && (
        <CardFlippableBody
          card={canonicalCard}
          showingInfo={showingInfo}
          onChangeTitle={(title) => editCard(pageCard.card.id, { title })}
        >
          <div className="js-card" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <iframe
              ref={iframeRef}
              className="js-card__iframe"
              style={{ height: iframeHeight }}
              sandbox="allow-scripts"
              srcDoc={srcDoc}
              title={canonicalCard.title || t("jsCard.pickerTileLabel")}
            />
            {error && <div className="js-card__error">{error}</div>}
          </div>
        </CardFlippableBody>
      )}
    </CardShell>
  );
}
