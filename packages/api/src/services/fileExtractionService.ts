import path from "node:path";
import { isEpubFile, isHtmlFile, isImageFile, isPdfFile } from "@wattle/shared";
import { modelProviderRegistry } from "@wattle/shared";
import { compileCleanupPrompt, compileExtractionPrompt, extractTextFromImage } from "@wattle/prompt-engine";
import { configuredProviderSettings, configuredVisionModel } from "../modelConfig.js";
import { activeProviderId } from "../providers/init.js";
import { uploadsDir } from "../uploads.js";
import {
  MAX_PDF_PAGES_OCR,
  PageLimitExceededError,
  extractPdfTextLayer,
  loadImageAsBase64Jpeg,
  renderPdfPages,
  type RenderedPage,
} from "./pdfRenderService.js";
import { extractEpubText, extractHtmlText } from "./htmlEpubService.js";

export type ExtractionMethodRequest = "auto" | "textLayer" | "ocr" | "aiCleanup";
export type ExtractionMethodUsed = "textLayer" | "ocr" | "aiCleanup";

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly code: "unsupported_type" | "page_limit_exceeded" | "no_text_layer" | "model_failed",
  ) {
    super(message);
  }
}

export interface ExtractionOutcome {
  text: string;
  method: ExtractionMethodUsed;
  model?: string;
  pageCount?: number;
  truncated: boolean;
}

/** Stored alongside every Card's metadata, which rides along on every page-load
 *  fetch for that Card — capped so one huge PDF's transcription doesn't bloat every
 *  such fetch. */
const MAX_STORED_EXTRACTION_CHARS = 100_000;
/** Below this average chars/page, a PDF's own text layer is treated as
 *  "effectively empty" (a scan with an OCR'd-garbage or absent text layer) — used
 *  only by the "auto" method to decide whether to fall back to OCR; an explicit
 *  "textLayer" request surfaces this as a "no_text_layer" error instead of silently
 *  switching methods. */
const MIN_CHARS_PER_PAGE = 20;
const OCR_CONCURRENCY = 3;
/** Total wall-clock budget for an OCR run (all pages), so a multi-page PDF can never
 *  hang the synchronous HTTP request indefinitely even if the vision model is slow —
 *  checked between page dispatches, not just once up front. */
const TOTAL_OCR_BUDGET_MS = 240_000;

function resolveVisionModel(): string {
  return configuredVisionModel() ?? process.env.VISION_MODEL_ID ?? "gemini-flash";
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_STORED_EXTRACTION_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_STORED_EXTRACTION_CHARS), truncated: true };
}

/** Runs `extractTextFromImage` over every rendered page at OCR_CONCURRENCY-wide
 *  concurrency, preserving page order in the result regardless of completion order.
 *  A shared `nextIndex` cursor (rather than chunking into fixed batches) keeps every
 *  worker busy until the whole set is done, not just until the slowest page in its
 *  own batch finishes. */
async function ocrPages(
  pages: RenderedPage[],
  systemPrompt: string,
  userText: string,
  model: string,
): Promise<{ pageNumber: number; text: string; model: string }[]> {
  const deadline = Date.now() + TOTAL_OCR_BUDGET_MS;
  const results: { pageNumber: number; text: string; model: string }[] = new Array(pages.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < pages.length) {
      if (Date.now() > deadline) {
        throw new ExtractionError("OCR took too long — try again, or with fewer pages.", "model_failed");
      }
      const i = nextIndex++;
      const page = pages[i];
      try {
        const result = await extractTextFromImage({
          image: { mimeType: page.mimeType, base64: page.base64 },
          systemPrompt,
          userText,
          model,
        });
        results[i] = { pageNumber: page.pageNumber, text: result.text, model: result.model };
      } catch (err) {
        throw new ExtractionError(
          `OCR failed on page ${page.pageNumber}: ${err instanceof Error ? err.message : String(err)}`,
          "model_failed",
        );
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(OCR_CONCURRENCY, pages.length) }, () => worker()));
  return results;
}

async function ocrPdf(filePath: string, instructions: string | undefined): Promise<ExtractionOutcome> {
  let pages: RenderedPage[];
  try {
    pages = await renderPdfPages(filePath, MAX_PDF_PAGES_OCR);
  } catch (err) {
    if (err instanceof PageLimitExceededError) throw new ExtractionError(err.message, "page_limit_exceeded");
    throw err;
  }
  const model = resolveVisionModel();
  const { systemPrompt, userText } = compileExtractionPrompt(instructions);
  const results = await ocrPages(pages, systemPrompt, userText, model);
  const joined = results.map((r) => `--- Page ${r.pageNumber} ---\n\n${r.text}`).join("\n\n");
  const { text, truncated } = truncate(joined);
  return { text, method: "ocr", model: results[0]?.model ?? model, pageCount: pages.length, truncated };
}

async function ocrImage(filePath: string, instructions: string | undefined): Promise<ExtractionOutcome> {
  const model = resolveVisionModel();
  const { systemPrompt, userText } = compileExtractionPrompt(instructions);
  const image = await loadImageAsBase64Jpeg(filePath);
  let result;
  try {
    result = await extractTextFromImage({ image, systemPrompt, userText, model });
  } catch (err) {
    throw new ExtractionError(`OCR failed: ${err instanceof Error ? err.message : String(err)}`, "model_failed");
  }
  const { text, truncated } = truncate(result.text);
  return { text, method: "ocr", model: result.model, truncated };
}

/** Runs the "AI Cleanup" Convert method's own model call — plain text-in/text-out
 *  through whichever provider ordinary generation is currently configured to use
 *  (activeProviderId()), not the vision-specific OpenRouter path OCR needs. Same
 *  "compile a prompt, call the model, accumulate one full string" shape
 *  actionScriptService.ts's generateActionScript already uses — short enough
 *  output that there's no need for streaming machinery here either. */
async function runCleanupPass(rawText: string): Promise<{ text: string; model: string }> {
  const { systemPrompt, userMessage } = compileCleanupPrompt(rawText);
  const providerId = activeProviderId();
  const provider = modelProviderRegistry.get(providerId);
  const settings = configuredProviderSettings(providerId);

  let text = "";
  try {
    for await (const chunk of provider.generate(userMessage, {
      systemPrompt,
      model: settings?.model,
      temperature: settings?.temperature,
      maxTokens: settings?.maxTokens,
    })) {
      text += chunk.text;
      if (chunk.done) break;
    }
  } catch (err) {
    throw new ExtractionError(
      `AI cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      "model_failed",
    );
  }
  return { text, model: settings?.model ?? providerId };
}

/**
 * The single entry point: takes a file Card's own metadata.file record plus the
 * user's explicit method choice and returns extracted text. Fully synchronous from
 * the caller's perspective (one awaited call, no queue) — every path is bounded by
 * the page/size/timeout limits above so it can never hang indefinitely behind an
 * HTTP request.
 *
 * "aiCleanup" is layered on top rather than being its own dispatch branch below:
 * it always starts from the same "auto" extraction every other method can reach
 * (text layer where possible, OCR fallback for scans), then runs that raw text
 * through runCleanupPass above — so PDF/image/HTML/EPUB all get the exact same
 * cleanup behavior for free instead of it being reimplemented per file kind.
 */
export async function extractFileText(
  file: { storedName: string; originalName: string; mimeType: string },
  opts: { method: ExtractionMethodRequest; instructions?: string },
): Promise<ExtractionOutcome> {
  if (opts.method === "aiCleanup") {
    const raw = await extractFileText(file, { method: "auto", instructions: opts.instructions });
    const cleaned = await runCleanupPass(raw.text);
    const { text, truncated } = truncate(cleaned.text);
    return { ...raw, text, method: "aiCleanup", model: cleaned.model, truncated };
  }

  const filePath = path.join(uploadsDir, file.storedName);

  if (isPdfFile(file.originalName, file.mimeType)) {
    if (opts.method === "ocr") return ocrPdf(filePath, opts.instructions);

    let layer;
    try {
      layer = await extractPdfTextLayer(filePath);
    } catch (err) {
      if (err instanceof PageLimitExceededError) throw new ExtractionError(err.message, "page_limit_exceeded");
      throw err;
    }
    const avgCharsPerPage = layer.pageCount > 0 ? layer.text.length / layer.pageCount : 0;
    const looksEmpty = avgCharsPerPage < MIN_CHARS_PER_PAGE;

    if (opts.method === "textLayer") {
      // No silent OCR fallback here — an explicit "textLayer" request either
      // succeeds on the PDF's own text layer or fails with a clear next step.
      if (looksEmpty) {
        throw new ExtractionError(
          "This PDF has no usable text layer (probably a scan) — try OCR instead.",
          "no_text_layer",
        );
      }
      const { text, truncated } = truncate(layer.text);
      return { text, method: "textLayer", pageCount: layer.pageCount, truncated };
    }

    // "auto": try the fast/free path first, fall back to OCR only if it's empty.
    if (!looksEmpty) {
      const { text, truncated } = truncate(layer.text);
      return { text, method: "textLayer", pageCount: layer.pageCount, truncated };
    }
    return ocrPdf(filePath, opts.instructions);
  }

  if (isImageFile(file.originalName, file.mimeType)) {
    if (opts.method === "textLayer") {
      throw new ExtractionError("An image has no text layer to extract — use OCR instead.", "unsupported_type");
    }
    return ocrImage(filePath, opts.instructions);
  }

  // HTML/EPUB are already markup, not an image — always the fast/free parse path,
  // no vision model involved. An explicit "ocr" request is simply not meaningful
  // here (nothing to render into an image), so it errors rather than silently
  // falling back to the parse path a user didn't ask for.
  if (isHtmlFile(file.originalName, file.mimeType)) {
    if (opts.method === "ocr") {
      throw new ExtractionError("An HTML document has no images to OCR — use Extract text instead.", "unsupported_type");
    }
    const { text } = await extractHtmlText(filePath);
    const { text: truncatedText, truncated } = truncate(text);
    return { text: truncatedText, method: "textLayer", truncated };
  }

  if (isEpubFile(file.originalName, file.mimeType)) {
    if (opts.method === "ocr") {
      throw new ExtractionError("An EPUB has no images to OCR — use Extract text instead.", "unsupported_type");
    }
    const { text, pageCount } = await extractEpubText(filePath);
    const { text: truncatedText, truncated } = truncate(text);
    return { text: truncatedText, method: "textLayer", pageCount, truncated };
  }

  throw new ExtractionError("Text extraction only supports PDFs, images, HTML, and EPUB.", "unsupported_type");
}
