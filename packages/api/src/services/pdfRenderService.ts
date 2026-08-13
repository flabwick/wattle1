import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as canvas from "@napi-rs/canvas";
// The legacy build is the one meant to run outside a browser (see pdfjs-dist's own
// docs) — the plain "pdfjs-dist" entry point assumes DOM globals this Node process
// doesn't have.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// pdfjs's canvas backend expects these as real globals (its own type declarations
// reference the DOM lib's types for them, which is why this type-checks fine without
// this file existing at all — but at runtime, in Node, none of the three exist unless
// supplied here). Doing this at module load, once, in the one module that imports
// pdfjs.
(globalThis as Record<string, unknown>).DOMMatrix ??= canvas.DOMMatrix;
(globalThis as Record<string, unknown>).Path2D ??= canvas.Path2D;
(globalThis as Record<string, unknown>).ImageData ??= canvas.ImageData;

// Resolved via import.meta.resolve (Node's own module resolution) rather than
// relative-path arithmetic off this file's own location — robust to npm workspaces'
// hoisting pdfjs-dist to the repo root's node_modules rather than
// packages/api/node_modules.
const pdfjsRoot = dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));

// pdfjs runs its parsing work off the main thread via a Worker pointed at this file;
// without setting this explicitly it tries to resolve one relative to wherever the
// bundler/runtime thinks pdfjs itself lives, which is unreliable outside a browser.
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(pdfjsRoot, "legacy", "build", "pdf.worker.mjs")).href;

const STANDARD_FONT_DATA_URL = pathToFileURL(join(pdfjsRoot, "standard_fonts") + "/").href;

export const MAX_PDF_PAGES_TEXT_LAYER = 200;
export const MAX_PDF_PAGES_OCR = 10;
export const RENDER_MAX_EDGE_PX = 1600;
export const JPEG_QUALITY = 80;

export class PageLimitExceededError extends Error {
  constructor(readonly pageCount: number, readonly maxPages: number) {
    super(`This PDF has ${pageCount} pages; OCR is limited to ${maxPages} pages per run.`);
  }
}

export interface PdfTextLayerResult {
  text: string;
  pageCount: number;
}

export interface RenderedPage {
  pageNumber: number;
  mimeType: "image/jpeg";
  base64: string;
}

async function openPdf(filePath: string) {
  const data = await readFile(filePath);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  return loadingTask.promise;
}

/** Born-digital fast path: concatenates every page's own text-layer content, one
 *  line per distinct y-position, pages separated by a marker — no rasterization, no
 *  network call. Throws above MAX_PDF_PAGES_TEXT_LAYER so a pathological PDF can't
 *  hang the (synchronous, single-request) caller indefinitely. Callers decide what
 *  "effectively empty" means for falling back to OCR — this just returns whatever
 *  text layer exists, including none. */
export async function extractPdfTextLayer(filePath: string): Promise<PdfTextLayerResult> {
  const doc = await openPdf(filePath);
  try {
    if (doc.numPages > MAX_PDF_PAGES_TEXT_LAYER) {
      throw new PageLimitExceededError(doc.numPages, MAX_PDF_PAGES_TEXT_LAYER);
    }
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      // Items arrive in reading order already; joining with a single space per item
      // and a newline between distinct y-positions is a plain-text approximation,
      // not a layout-faithful reconstruction — good enough for "does this PDF have a
      // usable text layer at all" plus feeding the Convert flow's plain-text-to-HTML
      // builder (plainTextToWattleHtml.ts).
      let lastY: number | null = null;
      let line = "";
      const lines: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 1) {
          lines.push(line);
          line = "";
        }
        line += (line && !line.endsWith(" ") ? " " : "") + item.str;
        lastY = y;
      }
      if (line) lines.push(line);
      pageTexts.push(lines.join("\n"));
      page.cleanup();
    }
    return {
      text: pageTexts.map((t, i) => `--- Page ${i + 1} ---\n\n${t}`).join("\n\n"),
      pageCount: doc.numPages,
    };
  } finally {
    await doc.destroy();
  }
}

/** Downscales a rendered/loaded raster image to at most RENDER_MAX_EDGE_PX on its
 *  longest edge (a no-op if it's already smaller), re-encoded as JPEG — shared by
 *  renderPdfPages below and loadImageAsBase64Jpeg, since both need the same "shrink
 *  before sending to a vision model" step. */
async function downscaleToJpegBase64(image: canvas.Image | canvas.Canvas): Promise<string> {
  const srcWidth = "width" in image ? image.width : 0;
  const srcHeight = "height" in image ? image.height : 0;
  const scale = Math.min(1, RENDER_MAX_EDGE_PX / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const target = canvas.createCanvas(width, height);
  const ctx = target.getContext("2d");
  ctx.drawImage(image as never, 0, 0, width, height);
  const buffer = await target.encode("jpeg", JPEG_QUALITY);
  return buffer.toString("base64");
}

/** Rasterizes pages 1..min(pageCount, maxPages) at a scale that keeps the longest
 *  edge <= RENDER_MAX_EDGE_PX, encoded as JPEG (much smaller payload than PNG for
 *  scans/photos, and the vision model doesn't need lossless fidelity). Throws
 *  PageLimitExceededError above maxPages — checked before rendering anything, so a
 *  200-page PDF fails fast rather than starting a doomed render loop. */
export async function renderPdfPages(filePath: string, maxPages: number): Promise<RenderedPage[]> {
  const doc = await openPdf(filePath);
  try {
    if (doc.numPages > maxPages) {
      throw new PageLimitExceededError(doc.numPages, maxPages);
    }
    const pages: RenderedPage[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1, RENDER_MAX_EDGE_PX / Math.max(viewport.width, viewport.height));
      const scaledViewport = page.getViewport({ scale });
      const pageCanvas = canvas.createCanvas(Math.ceil(scaledViewport.width), Math.ceil(scaledViewport.height));
      const context = pageCanvas.getContext("2d");
      await page.render({ canvasContext: context as never, viewport: scaledViewport }).promise;
      const buffer = await pageCanvas.encode("jpeg", JPEG_QUALITY);
      pages.push({ pageNumber, mimeType: "image/jpeg", base64: buffer.toString("base64") });
      page.cleanup();
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

/** Decodes an uploaded image and downscales/re-encodes it as JPEG for the vision
 *  call — throws a clear error on a format @napi-rs/canvas can't decode (e.g. HEIC);
 *  format conversion is explicitly out of scope, this only ever prepares bytes for
 *  the OCR request, never writes anything back to disk. */
export async function loadImageAsBase64Jpeg(filePath: string): Promise<{ mimeType: "image/jpeg"; base64: string }> {
  const data = await readFile(filePath);
  let image: canvas.Image;
  try {
    image = await canvas.loadImage(data);
  } catch (err) {
    throw new Error(
      `Couldn't read this image (unsupported or corrupt format): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { mimeType: "image/jpeg", base64: await downscaleToJpegBase64(image) };
}
