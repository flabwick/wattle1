import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { isImageFile, isPdfFile } from "@wattle/shared";
import { Badge, CardShell } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { getCardFileUrl } from "../../../../api/client.js";
import { isMarkdownFile } from "../../../../lib/isMarkdownFile.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { CardHeaderStart } from "../../CardHeaderStart.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
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
 * onRequestEdit). Text extraction/OCR for a PDF/image/HTML/EPUB isn't reachable from
 * here at all — it's the Dock's "Standard Wattle Card" Convert action (Dock.tsx's
 * resolveConvertSourceHtml), which builds a *new* Card from the extracted text
 * rather than showing/caching it on this one. The header's own fold-caret/
 * select-checkbox (CardHeaderStart) is the only way to select now, same as every
 * other type; Save/turn-into-stack/fullscreen/info live in the header's own
 * CardHeaderActions row, everything else (Edit, Move, Hide, remove) is reached from
 * the Dock.
 */
export function FileView({
  pageCard,
  selected,
  onSelect,
  onRemove,
  onTurnIntoStack,
  onSendToDock,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const file = pageCard.card.metadata.file;
  const markdown = !!file && isMarkdownFile(file.originalName, file.mimeType);
  const [markdownText, setMarkdownText] = useState<string | null>(null);
  const [showingInfo, setShowingInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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
        onSendToDock={onSendToDock && (() => onSendToDock(pageCard.id))}
        onRemove={() => onRemove?.(pageCard.id)}
        showingInfo={showingInfo}
        onToggleInfo={() => setShowingInfo((v) => !v)}
      />
    </div>
  );

  const body =
    file && isPdfFile(file.originalName, file.mimeType) ? (
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
    ) : file && isImageFile(file.originalName, file.mimeType) ? (
      <img className="card__file-image" src={getCardFileUrl(pageCard.card.id)} alt={file.originalName} />
    ) : null;

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
        </CardFlippableBody>
      )}
    </CardShell>
  );
}
