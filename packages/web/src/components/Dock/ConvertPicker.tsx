import type { CSSProperties } from "react";
import { PopoverItem, PopoverSurface } from "../primitives/index.js";
import { useDismiss } from "../../hooks/useDismiss.js";
import { t } from "../../i18n/index.js";
import "./ConvertPicker.css";

interface ConvertPickerProps {
  /** Same fixed-viewport-coordinates convention as ProcessPicker.tsx — computed from
   *  the trigger button's own rect rather than CSS-anchored, since the button sits
   *  inside .dock__row's horizontally-scrolling box. */
  style: CSSProperties;
  /** null (not just disabled) whenever the selection is a single extractable File
   *  Card (PDF/image/HTML/EPUB) — the OCR/Extract Text/AI Cleanup methods below
   *  replace it for that case rather than sitting alongside it, since for a lone
   *  File Card "Standard Wattle Card" was always just silently running one of
   *  those methods anyway (see Dock.tsx's old resolveConvertSourceHtml). Non-null
   *  (always shown) for a multi-selection or any other single Card. */
  onPickStandardCard: (() => void) | null;
  /** Vision-model transcription (Dock.tsx's handleConvertFileCard("ocr")) — a PDF
   *  or image only; null for HTML/EPUB, which have no images to OCR. */
  onPickOcr: (() => void) | null;
  /** The document's own text layer/markup, parsed directly, no vision model — a
   *  PDF/HTML/EPUB only; null for a plain image, which has no text layer at all. */
  onPickExtractText: (() => void) | null;
  /** Extraction followed by an LLM cleanup pass (fixes OCR artifacts, restores
   *  paragraph structure) — available for any extractable File Card. */
  onPickAiCleanup: (() => void) | null;
  /** "Split into Cards" (Dock.tsx's handleConvertToDividedCards) — an EPUB's own
   *  chapters or an HTML document's own top-level headings, each becoming its own
   *  Card. null (not just disabled) when the current selection isn't a single
   *  EPUB/HTML file Card — dividing only has a sensible per-source meaning, not a
   *  combined-selection one the way the standard-card convert does. */
  onPickDivide: (() => void) | null;
  onClose: () => void;
}

/** The Dock's Convert action opens this — pick which form to convert the current
 *  selection into. For a single PDF/image/HTML/EPUB File Card this shows the
 *  applicable subset of OCR/Extract Text/AI Cleanup (plus Split into Cards for an
 *  EPUB/HTML) instead of Standard Wattle Card; every other selection just gets
 *  Standard Wattle Card, unchanged. */
export function ConvertPicker({
  style,
  onPickStandardCard,
  onPickOcr,
  onPickExtractText,
  onPickAiCleanup,
  onPickDivide,
  onClose,
}: ConvertPickerProps) {
  const rootRef = useDismiss<HTMLDivElement>(onClose, { excludeSelector: ".dock__convert-wrap" });

  return (
    <PopoverSurface ref={rootRef} className="convert-picker" style={style}>
      {onPickStandardCard && (
        <PopoverItem variant="menu" icon="convert" onClick={onPickStandardCard}>
          <span>{t("dock.convert.standardCard")}</span>
        </PopoverItem>
      )}
      {onPickExtractText && (
        <PopoverItem variant="menu" icon="copy" onClick={onPickExtractText}>
          <span>{t("dock.convert.extractText")}</span>
        </PopoverItem>
      )}
      {onPickOcr && (
        <PopoverItem variant="menu" icon="eye" onClick={onPickOcr}>
          <span>{t("dock.convert.ocr")}</span>
        </PopoverItem>
      )}
      {onPickAiCleanup && (
        <PopoverItem variant="menu" icon="generate" onClick={onPickAiCleanup}>
          <span>{t("dock.convert.aiCleanup")}</span>
        </PopoverItem>
      )}
      {onPickDivide && (
        <PopoverItem variant="menu" icon="stackAdd" onClick={onPickDivide}>
          <span>{t("dock.convert.divide")}</span>
        </PopoverItem>
      )}
    </PopoverSurface>
  );
}
