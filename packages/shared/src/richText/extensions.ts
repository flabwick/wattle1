import StarterKit from "@tiptap/starter-kit";
import type { Extensions } from "@tiptap/core";
import { CardEmbedNode } from "./cardEmbedNode.js";

/** The formatting extension set — one shared config so the client's live editor and
 *  the server's headless parsing (plainText.ts's htmlToDoc) always agree on what a
 *  document can contain. Anything the web app needs beyond this (a NodeView for
 *  cardEmbed) extends *this* set rather than reconfiguring StarterKit separately —
 *  see packages/web/src/components/Card/richtext/extensions.ts. */
export const richTextStarterKit = StarterKit;

/** Schema-only extension list (no React NodeView on cardEmbed) — safe to use
 *  headlessly on the server (annotationService.ts, the data migration script). */
export const baseRichTextExtensions: Extensions = [StarterKit, CardEmbedNode];
