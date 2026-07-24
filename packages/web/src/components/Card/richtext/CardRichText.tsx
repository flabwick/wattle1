import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Annotation } from "@wattle/shared";
import { flattenToPlainText } from "@wattle/shared";
import type { AnnotationProcess } from "../../../api/client.js";
import { SelectionMenu } from "../SelectionMenu.js";
import { DiffPopover } from "../DiffPopover.js";
import { AnnotationDetail } from "../AnnotationDetail.js";
import { t } from "../../../i18n/index.js";
import { CardEditingContext } from "./CardEditingContext.js";
import type { CardEditingContextValue } from "./CardEditingContext.js";
import { richTextExtensions } from "./extensions.js";
import { annotationDecorationsKey } from "./AnnotationDecorations.js";
import { getActiveEditor, setActiveEditor, setActiveEditorFocused } from "../../../lib/activeEditorRegistry.js";
import "../AnnotatedText.css";
import "./CardRichText.css";

export interface CardRichTextHandle {
  /** Inserts a cardEmbed node at the cursor — see Card.tsx's "insert card link"
   *  toolbar button. Replaces the old insertToken(`[[id]]`) string-splice. */
  insertEmbed: (cardId: string) => void;
  editor: Editor | null;
}

interface CardRichTextProps {
  /** HTML — the stored format now (see richText/cardEmbedNode.ts's doc comment for
   *  why, and packages/api/scripts/migrateContentToHtml.ts for the one-time
   *  conversion of pre-existing plain-text content). */
  content: string;
  onChangeContent: (next: string) => void;
  /** False for CardContent.tsx's old read-only render; true for
   *  CardContentEditor.tsx's old editing render — now the same component either
   *  way, toggled live via editor.setEditable(). */
  editable: boolean;
  /** The real Card id this exact content belongs to — used to scope the selection
   *  menu's diff/footnote/highlight actions (only shown while !editable, matching
   *  the old CardContentEditor never rendering AnnotatedText/SelectionMenu at all —
   *  annotations are a read-mode-only overlay). */
  cardId: string;
  /** This exact Card's own diff/footnote/highlight overlays (Card.metadata.annotations
   *  — cardMetadata.ts) — never a parent's or a nested embed's, each of those threads
   *  its own via its own recursive CardRichText/CardEmbed pair. Rendered only in read
   *  mode (AnnotationDecorations.ts/the effect below) — there's nothing to annotate
   *  mid-edit. */
  annotations?: readonly Annotation[];
  ancestorIds: ReadonlySet<string>;
  depth: number;
  selectedEmbedId?: string | null;
  onSelectEmbed?: (cardId: string, onRemove: () => void) => void;
  onRequestEditEmbed?: (cardId: string, onRemove: () => void) => void;
  editingEmbedIds?: ReadonlySet<string>;
  onToggleEmbedEdit?: (cardId: string) => void;
  onRunProcess?: (cardId: string, process: AnnotationProcess, selectionText?: string) => void;
  onCreateManualHighlight?: (cardId: string, anchor: string, color: string) => void;
  onAcceptDiff?: (cardId: string, annotationId: string) => void;
  onRemoveAnnotation?: (cardId: string, annotationId: string) => void;
  onUpdateAnnotationText?: (cardId: string, annotationId: string, text: string) => void;
  hideFoldButton?: boolean;
  /** card.contentPlaceholder for a top-level Card; card.contentPlaceholder is also
   *  the sole default — CardEmbed content has never had its own placeholder text. */
  placeholder?: string;
}

const EMPTY_EDITING_EMBED_IDS: ReadonlySet<string> = new Set();
const EMPTY_ANNOTATIONS: readonly Annotation[] = [];
function noop() {}

/** Fixed viewport coordinates just below the triggering element — every diff/
 *  footnote/highlight popover portals to document.body (they mount inside inline
 *  elements like <mark>/<span>/<sup>, which can't legally contain a <div>), so each
 *  needs its own position computed from the DOMRect captured at click time rather
 *  than a CSS anchor against a DOM ancestor. Relocated from the old AnnotatedText.tsx
 *  unchanged. */
function popoverStyle(rect: DOMRect): { position: "fixed"; top: number; left: number } {
  return { position: "fixed", top: rect.bottom + 4, left: rect.left };
}

/**
 * The Card content renderer/editor, unified — CardContent.tsx (read) and
 * CardContentEditor.tsx (edit) used to be two structurally different trees (plain
 * AnnotatedText spans vs. a run of auto-growing textareas); this is one TipTap
 * `Editor` instance either way, `editable` toggled live rather than swapping
 * components, so a `cardEmbed` node and its own nested editing state look and behave
 * identically whether this Card itself happens to be editing or not.
 *
 * `content`/`onChangeContent` are "controlled" in the sense that external changes
 * (switching which Card this is, another tab editing the same Card via the shared
 * cardStore) resync the editor — but never on this editor's *own* keystrokes: see
 * lastEmittedContent below, which is what keeps the cursor from jumping on every
 * character typed.
 */
export const CardRichText = forwardRef<CardRichTextHandle, CardRichTextProps>(function CardRichText(
  {
    content,
    onChangeContent,
    editable,
    cardId,
    annotations = EMPTY_ANNOTATIONS,
    ancestorIds,
    depth,
    selectedEmbedId,
    onSelectEmbed,
    onRequestEditEmbed,
    editingEmbedIds = EMPTY_EDITING_EMBED_IDS,
    onToggleEmbedEdit = noop,
    onRunProcess,
    onCreateManualHighlight,
    onAcceptDiff,
    onRemoveAnnotation,
    onUpdateAnnotationText,
    hideFoldButton,
    placeholder,
  },
  ref,
) {
  const lastEmittedContent = useRef(content);
  const containerRef = useRef<HTMLDivElement>(null);
  // Which diff/highlight/footnote popover is open, if any — same shape and
  // convention the old AnnotatedText.tsx used, just fed by the click-delegation
  // effect below instead of a per-span React onClick (decorations render plain DOM,
  // not JSX — see AnnotationDecorations.ts).
  const [open, setOpen] = useState<{ id: string; rect: DOMRect } | null>(null);

  const editor = useEditor({
    extensions: richTextExtensions,
    content,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedContent.current = html;
      onChangeContent(html);
    },
    onFocus: ({ editor }) => {
      setActiveEditor(editor);
      setActiveEditorFocused(true);
    },
    // Not "this editor is gone" — just "not the thing with focus right now" (e.g. the
    // Card's title field, a plain <input>, just took it instead). Dock.tsx's
    // formatting row keys off this to hide while the title field is focused.
    onBlur: () => setActiveEditorFocused(false),
  });

  // Syncs genuinely external content changes in (a different Card being displayed
  // under the same mounted instance never happens today — call sites key by cardId,
  // remounting instead — so in practice this only fires for another tab/session
  // editing the same Card via the shared cardStore, or a Stack switching which
  // member is active under this same always-mounted instance — see StackBody.tsx).
  // Never fires from this editor's own typing: lastEmittedContent.current is updated
  // synchronously in onUpdate above, so the prop update that typing causes always
  // matches it here.
  useEffect(() => {
    if (!editor) return;
    if (content === lastEmittedContent.current) return;
    if (content === editor.getHTML()) return;
    lastEmittedContent.current = content;
    // Deferred a tick: setContent synchronously mounts any embedded card's NodeView,
    // which (tiptap-react) flushSyncs — illegal from inside this passive effect
    // (React: "flushSync was called from inside a lifecycle method"). A microtask
    // runs after this commit finishes, same content, no visible delay.
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      editor.commands.setContent(content, { emitUpdate: false });
    });
  }, [content, editor]);

  // editable isn't part of useEditor's initial options after creation — TipTap only
  // applies it once, at mount, from that first options object.
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  useEffect(() => {
    return () => {
      // Only clear the registry if we were the last-focused editor — otherwise this
      // unmount (e.g. a sibling embed collapsing) would wrongly blank out a *different*
      // editor's still-valid active state.
      if (getActiveEditor() === editor) {
        setActiveEditor(null);
        setActiveEditorFocused(false);
      }
    };
  }, [editor]);

  // Feeds the live `annotations` prop into AnnotationDecorations.ts's plugin state —
  // a plugin can only change in response to a transaction, so this is the standard
  // "external data into a ProseMirror plugin" pattern (tr.setMeta), not a direct
  // options mutation. Same read-mode-only gating SelectionMenu already has: editing
  // sends an empty array rather than leaving stale decorations painted under the
  // cursor while typing.
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(annotationDecorationsKey, editable ? [] : annotations));
  }, [editor, annotations, editable]);

  // Event delegation for every annotation decoration's click target
  // (AnnotationDecorations.ts stamps a `data-annotation-id` on each) — decorations
  // are plain DOM, not JSX, so there's no per-span onClick to attach directly the
  // way the old AnnotatedText.tsx did. `.closest()` naturally resolves a click on
  // diff-and-highlighted text to the diff (it's the innermost decorated element),
  // matching the old nested-DOM priority without needing explicit stopPropagation.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function handleClick(e: MouseEvent) {
      const target = (e.target as Element).closest<HTMLElement>("[data-annotation-id]");
      if (!target) return;
      e.stopPropagation();
      setOpen({ id: target.dataset.annotationId!, rect: target.getBoundingClientRect() });
    }
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, []);

  useImperativeHandle(ref, () => ({
    editor,
    insertEmbed(cardIdToInsert: string) {
      editor?.chain().focus().insertContent({ type: "cardEmbed", attrs: { cardId: cardIdToInsert } }).run();
    },
  }));

  const contextValue: CardEditingContextValue = {
    ancestorIds,
    depth,
    selectedEmbedId,
    onSelectEmbed,
    onRequestEditEmbed,
    editingEmbedIds,
    onToggleEmbedEdit,
    onRunProcess,
    onCreateManualHighlight,
    onAcceptDiff,
    onRemoveAnnotation,
    onUpdateAnnotationText,
    hideFoldButton,
  };

  // Same convention the old CardContent.tsx's AnnotatedText used: the selection-menu
  // and the diff/highlight/footnote decorations/popovers only ever show in read
  // mode — there's nothing to annotate mid-edit.
  const selectionMenu = !editable && onRunProcess && onCreateManualHighlight && (
    <SelectionMenu
      containerRef={containerRef}
      editor={editor}
      onRunProcess={(process, selectionText) => onRunProcess(cardId, process, selectionText)}
      onCreateManualHighlight={(selectionText, color) => onCreateManualHighlight(cardId, selectionText, color)}
    />
  );

  const openAnnotation = open ? annotations.find((a) => a.id === open.id) : undefined;
  const annotationPopover = !editable && open && openAnnotation && (
    openAnnotation.type === "diff" ? (
      onAcceptDiff &&
      onRemoveAnnotation && (
        <DiffPopover
          style={popoverStyle(open.rect)}
          original={openAnnotation.anchor}
          replacement={openAnnotation.replacement}
          onAccept={() => {
            onAcceptDiff(cardId, openAnnotation.id);
            setOpen(null);
          }}
          onReject={() => {
            onRemoveAnnotation(cardId, openAnnotation.id);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )
    ) : (
      onUpdateAnnotationText &&
      onRemoveAnnotation && (
        <AnnotationDetail
          title={
            openAnnotation.type === "footnote" ? t("annotation.footnote.title") : t("annotation.highlight.title")
          }
          anchor={openAnnotation.anchor}
          text={openAnnotation.text ?? ""}
          placeholder={
            openAnnotation.type === "footnote"
              ? t("annotation.footnote.placeholder")
              : t("annotation.highlight.placeholder")
          }
          onChangeText={(next) => onUpdateAnnotationText(cardId, openAnnotation.id, next)}
          onRemove={() => onRemoveAnnotation(cardId, openAnnotation.id)}
          onClose={() => setOpen(null)}
        />
      )
    )
  );

  return (
    <CardEditingContext.Provider value={contextValue}>
      <div ref={containerRef} className="card-rich-text">
        <EditorContent editor={editor} />
        {editor?.isEmpty && !editable && (
          <p className="card__preview card-rich-text__empty">
            {placeholder ?? t("card.emptyContent")}
          </p>
        )}
        {selectionMenu}
        {annotationPopover}
      </div>
    </CardEditingContext.Provider>
  );
});
