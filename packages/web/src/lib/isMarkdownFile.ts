/** Whether a File Card's own upload is a Markdown document — shared by FileView.tsx
 *  (which renders one read-only via react-markdown) and Dock.tsx's Convert action
 *  (which actually parses one into real Wattle rich text, markdownToWattleHtml.ts). */
export function isMarkdownFile(originalName: string, mimeType: string): boolean {
  return mimeType === "text/markdown" || /\.(md|markdown)$/i.test(originalName);
}
