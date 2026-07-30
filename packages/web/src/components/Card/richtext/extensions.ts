import { ReactNodeViewRenderer } from "@tiptap/react";
import type { Extensions } from "@tiptap/core";
import {
  ActionButtonNode,
  ActionFieldNode,
  CalloutNode,
  CardEmbedNode,
  MathBlockNode,
  MathInlineNode,
  codeBlockExtension,
  imageExtension,
  richTextStarterKit,
  taskItemExtension,
  taskListExtension,
  tableExtension,
} from "@wattle/shared";
import { CardEmbedNodeView } from "./CardEmbedNodeView.js";
import { ActionButtonNodeView } from "./ActionButtonNodeView.js";
import { ActionFieldNodeView } from "./ActionFieldNodeView.js";
import { CalloutNodeView } from "./CalloutNodeView.js";
import { MathNodeView } from "./MathNodeView.js";
import { CodeBlockNodeView } from "./CodeBlockNodeView.js";
import { AnnotationDecorations } from "./AnnotationDecorations.js";
import { SelectionHighlightDecoration } from "./SelectionHighlightDecoration.js";

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

/** Same "schema on the server, NodeView on the client" split as CardEmbedNode
 *  above — see richText/actionButtonNode.ts. */
const ActionButtonNodeExtension = ActionButtonNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ActionButtonNodeView);
  },
});

const ActionFieldNodeExtension = ActionFieldNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ActionFieldNodeView);
  },
});

/** Same split as CardEmbedNode above — see richText/calloutNode.ts. */
const CalloutNodeExtension = CalloutNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },
});

/** Both math nodes share one NodeView component (MathNodeView.tsx branches on
 *  `node.type.name`) — see richText/mathNode.ts. */
const MathInlineNodeExtension = MathInlineNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
});
const MathBlockNodeExtension = MathBlockNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
});

/** Adds the mermaid-fence live preview on top of the server's plain codeBlock
 *  schema — a no-op for the server's headless HTML generation, same "NodeView is
 *  client-only" split as every other node here. */
const codeBlockExtensionWithNodeView = codeBlockExtension.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
});

export const richTextExtensions: Extensions = [
  richTextStarterKit,
  codeBlockExtensionWithNodeView,
  taskListExtension,
  taskItemExtension,
  tableExtension,
  imageExtension,
  CalloutNodeExtension,
  MathInlineNodeExtension,
  MathBlockNodeExtension,
  CardEmbedNodeExtension,
  ActionButtonNodeExtension,
  ActionFieldNodeExtension,
  AnnotationDecorations,
  SelectionHighlightDecoration,
];
