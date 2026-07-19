import { ReactNodeViewRenderer } from "@tiptap/react";
import type { Extensions } from "@tiptap/core";
import { CardEmbedNode, richTextStarterKit } from "@wattle/shared";
import { CardEmbedNodeView } from "./CardEmbedNodeView.js";
import { AnnotationDecorations } from "./AnnotationDecorations.js";

/** Same node name/schema as the server's headless baseRichTextExtensions
 *  (@wattle/shared), extended with a React NodeView so it actually renders as a
 *  live nested CardEmbed instead of just holding a cardId attribute — the schema
 *  itself must stay identical to the server's or the plain-text projection used for
 *  annotation anchoring (richText/plainText.ts) would silently diverge between
 *  client and server. */
const CardEmbedNodeExtension = CardEmbedNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CardEmbedNodeView);
  },
});

export const richTextExtensions: Extensions = [richTextStarterKit, CardEmbedNodeExtension, AnnotationDecorations];
