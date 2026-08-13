import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export interface DocumentSection {
  title: string;
  text: string;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** A standalone headless DOM for one HTML string — a fresh Window per call (cheap;
 *  happy-dom's own doc-write parse is what we actually want, not a persistent
 *  document), used for both plain .html uploads and EPUB chapter files (which are
 *  themselves just XHTML documents). document.write handles a full
 *  `<html><head>...<body>...` document the same way a browser would, stripping
 *  `<script>`/`<style>` content out of the text this produces. */
function parseHtmlDocument(html: string) {
  const window = new Window();
  window.document.write(html);
  return window.document;
}

/** One paragraph per line innerText's own block-boundary detection already produces
 *  — a fair approximation of "one block-level element == one paragraph" for typical
 *  prose (headings/paragraphs/list items), without hand-walking the DOM tree to
 *  reconstruct block boundaries ourselves. */
function documentInnerTextLines(root: { innerText?: string }): string[] {
  return (root.innerText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Splits an already-line-broken text (documentInnerTextLines' own output) into
 *  sections at each heading line — matched by exact text, in order, against the
 *  next not-yet-consumed heading only (so a body line that happens to repeat an
 *  *earlier* heading's exact text can't falsely re-trigger a new section). Known
 *  limitation: two headings with identical text still only produce one boundary per
 *  occurrence in `lines`, in order — acceptable for a "nice to have" division
 *  feature, not something worth a heavier structural (DOM-position-based) approach
 *  for. Any content preceding the first heading merges into that first section
 *  rather than becoming its own tiny "preamble" one.
 */
function divideByHeadingLines(lines: string[], headingTexts: string[], fallbackTitle: string): DocumentSection[] {
  const cleanHeadings = headingTexts.map((h) => h.trim()).filter(Boolean);
  if (cleanHeadings.length === 0) {
    return lines.length > 0 ? [{ title: fallbackTitle, text: lines.join("\n\n") }] : [];
  }

  const sections: DocumentSection[] = [];
  let current: { title: string; lines: string[] } | null = null;
  const preamble: string[] = [];
  let nextHeadingIndex = 0;

  for (const line of lines) {
    if (nextHeadingIndex < cleanHeadings.length && line === cleanHeadings[nextHeadingIndex]) {
      if (current) sections.push({ title: current.title, text: current.lines.join("\n\n") });
      current = { title: line, lines: [] };
      nextHeadingIndex++;
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current) sections.push({ title: current.title, text: current.lines.join("\n\n") });

  if (preamble.length > 0) {
    if (sections.length > 0) {
      sections[0] = {
        title: sections[0].title,
        text: [preamble.join("\n\n"), sections[0].text].filter(Boolean).join("\n\n"),
      };
    } else {
      sections.push({ title: fallbackTitle, text: preamble.join("\n\n") });
    }
  }
  return sections;
}

/** Whole-document plain text — the "file" CardType's text-extraction path for an
 *  .html/.htm upload (fileExtractionService.ts). No vision model involved: this is
 *  markup, not an image, so it's always the fast/free path, same reasoning a PDF's
 *  own text layer is tried before OCR. */
export async function extractHtmlText(filePath: string): Promise<{ text: string }> {
  const html = await readFile(filePath, "utf-8");
  const document = parseHtmlDocument(html);
  return { text: documentInnerTextLines(document.body).join("\n\n") };
}

/** Splits an HTML document into sections at each top-level `<h1>` — the "division"
 *  feature's HTML path (Dock.tsx's "Split into Cards" Convert option). Falls back to
 *  one whole-document section if there's no `<h1>` at all. */
export async function divideHtmlIntoSections(filePath: string, fallbackTitle: string): Promise<DocumentSection[]> {
  const html = await readFile(filePath, "utf-8");
  const document = parseHtmlDocument(html);
  const headingTexts = [...document.querySelectorAll("h1")].map((h) => h.textContent ?? "");
  const lines = documentInnerTextLines(document.body);
  return divideByHeadingLines(lines, headingTexts, document.title || fallbackTitle);
}

async function loadEpub(filePath: string): Promise<JSZip> {
  const data = await readFile(filePath);
  return JSZip.loadAsync(data);
}

async function readZipText(zip: JSZip, zipPath: string): Promise<string> {
  const normalized = zipPath.replace(/^\.?\//, "");
  const entry = zip.file(normalized) ?? zip.file(zipPath);
  if (!entry) throw new Error(`This EPUB is missing an expected file: ${zipPath}`);
  return entry.async("string");
}

/** Resolves an EPUB's own chapter list, in reading order — META-INF/container.xml
 *  (the one fixed entry point every EPUB is required to have) points at the OPF
 *  package file, whose manifest (id -> href) and spine (ordered idrefs) together are
 *  the EPUB spec's own chapter division. This is what "division" uses for EPUBs
 *  instead of the heading-text-matching heuristic divideByHeadingLines needs for
 *  plain HTML — a spine entry IS a chapter, no guessing required. `linear="no"`
 *  spine entries (supplementary, not part of the primary reading order) are
 *  skipped, same as an EPUB reader would. */
async function readEpubChapterHrefs(zip: JSZip): Promise<string[]> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  const containerXml = await readZipText(zip, "META-INF/container.xml");
  const container = parser.parse(containerXml) as {
    container?: { rootfiles?: { rootfile?: unknown } };
  };
  const rootfile = toArray(container.container?.rootfiles?.rootfile)[0] as
    | { "@_full-path"?: string }
    | undefined;
  const opfPath = rootfile?.["@_full-path"];
  if (!opfPath) throw new Error("This EPUB's container.xml has no rootfile — can't locate its content.");
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const opfXml = await readZipText(zip, opfPath);
  const opf = parser.parse(opfXml) as {
    package?: { manifest?: { item?: unknown }; spine?: { itemref?: unknown } };
  };
  const manifestItems = toArray(opf.package?.manifest?.item) as { "@_id"?: string; "@_href"?: string }[];
  const spineItems = toArray(opf.package?.spine?.itemref) as { "@_idref"?: string; "@_linear"?: string }[];
  const manifestById = new Map(manifestItems.map((item) => [item["@_id"], item]));

  return spineItems
    .filter((ref) => ref["@_linear"] !== "no")
    .map((ref) => manifestById.get(ref["@_idref"]))
    .filter((item): item is { "@_id"?: string; "@_href"?: string } => !!item?.["@_href"])
    .map((item) => opfDir + item["@_href"]);
}

/** Whole-book plain text, every chapter concatenated in spine order — the "file"
 *  CardType's text-extraction path for an .epub upload. `pageCount` here means
 *  "chapter count", reusing ExtractionOutcome's own field rather than adding an
 *  epub-specific one — both mean "how many discrete units this was assembled
 *  from". */
export async function extractEpubText(filePath: string): Promise<{ text: string; pageCount: number }> {
  const zip = await loadEpub(filePath);
  const hrefs = await readEpubChapterHrefs(zip);
  const parts: string[] = [];
  for (const href of hrefs) {
    const document = parseHtmlDocument(await readZipText(zip, href));
    const text = documentInnerTextLines(document.body).join("\n\n");
    if (text) parts.push(text);
  }
  return { text: parts.join("\n\n--- • ---\n\n"), pageCount: hrefs.length };
}

/** Splits an EPUB into one section per spine chapter — the "division" feature's
 *  EPUB path. A chapter's own `<h1>` (or, failing that, its `<title>`) is its
 *  section title; a chapter whose body has no extractable text at all (a bare
 *  cover-image page, for instance) is skipped rather than becoming an empty Card. */
export async function divideEpubIntoSections(filePath: string): Promise<DocumentSection[]> {
  const zip = await loadEpub(filePath);
  const hrefs = await readEpubChapterHrefs(zip);
  const sections: DocumentSection[] = [];
  for (let i = 0; i < hrefs.length; i++) {
    const document = parseHtmlDocument(await readZipText(zip, hrefs[i]));
    // Removed (not just read) before computing body text — otherwise the heading
    // becomes both this section's `title` and its own body's first line.
    const h1 = document.querySelector("h1");
    const title = h1?.textContent?.trim() || document.title || `Chapter ${i + 1}`;
    h1?.remove();
    const text = documentInnerTextLines(document.body).join("\n\n");
    if (!text) continue;
    sections.push({ title, text });
  }
  return sections;
}
