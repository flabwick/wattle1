import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { isEpubFile, isHtmlFile, isImageFile, isPdfFile } from "@wattle/shared";
import { Badge, Button, CardShell } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { extractCardFileText, getCardFileUrl } from "../../../../api/client.js";
import { isMarkdownFile } from "../../../../lib/isMarkdownFile.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard, publishCard } from "../../../../lib/cardStore.js";
import { CardHeaderStart } from "../../CardHeaderStart.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";

/** ".pdf" -> "PDF"; a name with no dot (or ending in one) shows no badge at all. */
function extensionLabel(originalName: string): string | null {
  const match = /\.([^./]+)$/.exec(originalName);
  return match ? match[1].toUpperCase() : null;
}

/**
 * The "file" CardType's render — every upload gets the same title-and-extension
 * header (so a card is identifiable at a glance without opening it), then a
 * type-specific body: a PDF renders inline via the browser's built-in PDF viewer (no
 * client-side PDF library needed), a .md file is fetched as raw text and rendered as
 * GitHub-flavored markdown (tables, task lists, fenced code highlighting), an image
 * renders as a plain `<img>` preview, and anything else (including EPUB/HTML —
 * neither is safely/usefully renderable inline) just shows the header (see
 * fileCardType.ts — there's no editor for any of these, so no onDoubleClick wired to
 * onRequestEdit). PDF/image/HTML/EPUB all still get the Extract text action below
 * the body regardless of whether they render one. The header's own
 * fold-caret/select-checkbox (CardHeaderStart) is the only way to select now, same
 * as every other type; Save/turn-into-stack/fullscreen/info live in the header's
 * own CardHeaderActions row, everything else (Edit, Move, Hide, remove) is reached
 * from the Dock.
 */
export function FileView({ pageCard, selected, onSelect, onRemove, onTurnIntoStack }: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const file = pageCard.card.metadata.file;
  const markdown = !!file && isMarkdownFile(file.originalName, file.mimeType);
  const isPdf = !!file && isPdfFile(file.originalName, file.mimeType);
  const isImage = !!file && isImageFile(file.originalName, file.mimeType);
  // Neither renders a body preview of its own (an EPUB is a zip, not directly
  // renderable; an HTML upload isn't sandboxed for safe inline rendering) — they
  // fall through to the same bare header the `null` body branch below gives any
  // other unrecognized file type. Both still get the Extract text action, though.
  const isHtml = !!file && isHtmlFile(file.originalName, file.mimeType);
  const isEpub = !!file && isEpubFile(file.originalName, file.mimeType);
  const canExtract = isPdf || isImage || isHtml || isEpub;
  const [markdownText, setMarkdownText] = useState<string | null>(null);
  const [showingInfo, setShowingInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Read off the live card, not the pageCard prop, so this section updates the
  // moment an extraction completes (the same "canonicalCard" the title/content
  // already render from) without waiting for a fresh Page fetch.
  const extraction = canonicalCard.metadata.file?.extraction;
  const [extracting, setExtracting] = useState<"auto" | "ocr" | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [showExtraction, setShowExtraction] = useState(false);

  useEffect(() => {
    if (!markdown || !file) return;
    let cancelled = false;
    fetch(getCardFileUrl(pageCard.card.id))
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled) setMarkdownText(text);
      });
    return () => {
      cancelled = true;
    };
  }, [markdown, file, pageCard.card.id]);

  const extension = file ? extensionLabel(file.originalName) : null;
  const header = (
    <div className="card__header" onClick={onSelect}>
      <CardHeaderStart title={pageCard.card.title} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)}>
        {extension && <Badge>{extension}</Badge>}
      </CardHeaderStart>
      <CardHeaderActions
        onTurnIntoStack={onTurnIntoStack && (() => onTurnIntoStack(pageCard.id))}
        onRemove={() => onRemove?.(pageCard.id)}
        showingInfo={showingInfo}
        onToggleInfo={() => setShowingInfo((v) => !v)}
      />
    </div>
  );

  const body =
    file && isPdf ? (
      <iframe className="card__file-pdf" src={getCardFileUrl(pageCard.card.id)} title={file.originalName} />
    ) : file && markdown ? (
      <div className="card__file-markdown">
        {markdownText !== null ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {markdownText}
          </ReactMarkdown>
        ) : (
          file.originalName
        )}
      </div>
    ) : file && isImage ? (
      <img className="card__file-image" src={getCardFileUrl(pageCard.card.id)} alt={file.originalName} />
    ) : null;

  // Extract text / OCR — only meaningful for a PDF (which may or may not have its
  // own text layer) or an image (OCR only, "auto" and "ocr" are the same request
  // there — see fileExtractionService.ts). Local to this View rather than a Dock
  // action: Dock's own per-operation buttons are all bespoke-wired regardless of
  // supportedOperationIds, so this isn't actually smaller to build there, and
  // CardHeaderActions already establishes "a View owns its own local actions".
  async function handleExtract(method: "auto" | "ocr") {
    if (extracting) return;
    setExtracting(method);
    setExtractError(null);
    try {
      publishCard(await extractCardFileText(pageCard.card.id, { method }));
      setShowExtraction(true);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : t("file.extract.failed"));
    } finally {
      setExtracting(null);
    }
  }

  // Same "reveal hidden Cards" toggle Card.tsx's own "note" branch honors — shown
  // only while PageStack.tsx's revealHidden is on (see PageCardSlot), so this class
  // is always the "still hidden" indicator, never a false positive.
  const isHidden = Boolean(pageCard.card.metadata.hidden);

  return (
    <CardShell selected={selected} className={isHidden ? "card-shell--hidden" : undefined}>
      {header}
      {!collapsed && (
        <CardFlippableBody
          card={canonicalCard}
          showingInfo={showingInfo}
          onChangeTitle={(title) => editCard(pageCard.card.id, { title })}
        >
          {body}
          {canExtract && (
            <div className="card__file-actions">
              <Button disabled={!!extracting} onClick={() => handleExtract("auto")}>
                {extracting === "auto" ? t("file.extract.working") : t("file.extract.button")}
              </Button>
              {isPdf && (
                <Button
                  disabled={!!extracting}
                  title={t("file.extract.ocrButton")}
                  onClick={() => handleExtract("ocr")}
                >
                  {extracting === "ocr" ? t("file.extract.working") : t("file.extract.ocrButton")}
                </Button>
              )}
            </div>
          )}
          {extractError && <p className="card__file-extract-error">{extractError}</p>}
          {extraction && (
            <div className="card__file-extract">
              <button
                type="button"
                className="card__file-extract-toggle"
                onClick={() => setShowExtraction((v) => !v)}
              >
                {t("file.extract.heading")} · {extraction.method === "ocr" ? t("file.extract.viaOcr") : t("file.extract.viaTextLayer")}
              </button>
              {extraction.truncated && <p className="card__file-extract-truncated">{t("file.extract.truncated")}</p>}
              {showExtraction && <pre className="card__file-extract-text">{extraction.text}</pre>}
            </div>
          )}
        </CardFlippableBody>
      )}
    </CardShell>
  );
}
