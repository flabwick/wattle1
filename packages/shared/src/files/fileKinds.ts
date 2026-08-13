/** Whether a File Card's own upload is a PDF — shared by FileView.tsx (renders it
 *  via the browser's native `<iframe>` viewer) and fileExtractionService.ts (picks
 *  the text-layer/rasterize pipeline over the plain-image OCR one). */
export function isPdfFile(originalName: string, mimeType: string): boolean {
  return mimeType === "application/pdf" || /\.pdf$/i.test(originalName);
}

/** Whether a File Card's own upload is a raster image — shared by FileView.tsx
 *  (renders a plain `<img>` preview) and fileExtractionService.ts (OCR-only, no
 *  text layer to try first). */
export function isImageFile(originalName: string, mimeType: string): boolean {
  return mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif|tiff?)$/i.test(originalName);
}

/** Whether a File Card's own upload is a plain HTML document — shared by
 *  fileExtractionService.ts (htmlEpubService.ts's text-extraction/division path,
 *  no vision model involved — this is markup, not an image) and Dock.tsx's Convert
 *  gate. Excludes .xhtml deliberately: that extension only ever shows up as an EPUB
 *  chapter file, never a standalone upload, and isEpubFile below already covers the
 *  EPUB container itself. */
export function isHtmlFile(originalName: string, mimeType: string): boolean {
  return mimeType === "text/html" || /\.html?$/i.test(originalName);
}

/** Whether a File Card's own upload is an EPUB — shared by fileExtractionService.ts
 *  (htmlEpubService.ts's own zip/OPF-based parsing) and Dock.tsx's Convert gate. */
export function isEpubFile(originalName: string, mimeType: string): boolean {
  return mimeType === "application/epub+zip" || /\.epub$/i.test(originalName);
}
