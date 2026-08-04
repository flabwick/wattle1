import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Badge, Button, CardShell, Icon } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { getCardFileUrl } from "../../../../api/client.js";
import { isMarkdownFile } from "../../../../lib/isMarkdownFile.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";

function isPdf(originalName: string, mimeType: string): boolean {
  return mimeType === "application/pdf" || /\.pdf$/i.test(originalName);
}

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
 * GitHub-flavored markdown (tables, task lists, fenced code highlighting), and
 * anything else just shows the header (see fileCardType.ts — there's no editor for
 * any of these, so no onDoubleClick wired to onRequestEdit). A tap toggles selection
 * (App.tsx's toggleSelectPageCard) — in if not already selected, out again if it
 * was; everything else (Edit, Save, Move, Hide, remove) is reached from the Dock.
 */
export function FileView({ pageCard, selected, onSelect, onOpenFullscreen }: CardTypeViewProps) {
  const file = pageCard.card.metadata.file;
  const markdown = !!file && isMarkdownFile(file.originalName, file.mimeType);
  const [markdownText, setMarkdownText] = useState<string | null>(null);

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
    <div className="card__header">
      <div className="card__header-start">
        <span className="card__title">{pageCard.card.title}</span>
        {extension && <Badge>{extension}</Badge>}
      </div>
      <div className="card__header-actions">
        {onOpenFullscreen && (
          <Button
            iconOnly
            aria-label={t("card.openFullscreen")}
            title={t("card.openFullscreen")}
            onClick={(e) => {
              e.stopPropagation();
              onOpenFullscreen(pageCard.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Icon name="expand" />
          </Button>
        )}
      </div>
    </div>
  );

  const body =
    file && isPdf(file.originalName, file.mimeType) ? (
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
    ) : null;

  // Same "reveal hidden Cards" toggle Card.tsx's own "note" branch honors — shown
  // only while PageStack.tsx's revealHidden is on (see PageCardSlot), so this class
  // is always the "still hidden" indicator, never a false positive.
  const isHidden = Boolean(pageCard.card.metadata.hidden);

  return (
    <CardShell selected={selected} className={isHidden ? "card-shell--hidden" : undefined} onSelect={onSelect}>
      {header}
      {body}
    </CardShell>
  );
}
