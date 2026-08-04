import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Annotation, PageCardWithCard } from "@wattle/shared";
import { flattenToPlainText } from "@wattle/shared";
import type { AnnotationProcess } from "../../../api/client.js";
import { createPortal } from "react-dom";
import { SelectionMenu } from "../SelectionMenu.js";
import { DiffPopover } from "../DiffPopover.js";
import { AnnotationDetail } from "../AnnotationDetail.js";
import { Icon } from "../../primitives/index.js";
import { t } from "../../../i18n/index.js";
import { CardEditingContext } from "./CardEditingContext.js";
import type { CardEditingContextValue } from "./CardEditingContext.js";
import { richTextExtensions } from "./extensions.js";
import { annotationDecorationsKey } from "./AnnotationDecorations.js";
import { selectionHighlightKey } from "./SelectionHighlightDecoration.js";
import type { SelectionHighlightEntry } from "./SelectionHighlightDecoration.js";
import { getActiveEditor, setActiveEditor, setActiveEditorFocused } from "../../../lib/activeEditorRegistry.js";
import { removeQuote, useQuotes } from "../../../lib/quotesRegistry.js";
import "../AnnotatedText.css";
import "./CardRichText.css";

export interface CardRichTextHandle {
  /** Inserts a cardEmbed node at the cursor — used by EmbeddableTextField.tsx's own
   *  "insert card link" button (an Action Card's own content/instructions config).
   *  Replaces the old insertToken(`[[id]]`) string-splice. A note's own main content
   *  no longer inserts through this ref at all — that, and every other rich-text
   *  insert action (action button, field), now goes through the Dock instead,
   *  operating directly on activeEditorRegistry's globally-tracked instance
   *  (Dock.tsx), since the Dock is a sibling of wherever the editor lives, not this
   *  component's parent. */
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
  selectedEmbedIds?: ReadonlySet<string>;
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
  /** Only ever passed by Card.tsx (depth 0, the top-level Card actually placed on a
   *  Page) — powers any inline actionButton/actionField nodes in this content (rich
   *  text follow-up to the Apps feature). Never forwarded into a nested CardEmbed's
   *  own recursive CardRichText, so an action button inside an *embedded* Card is
   *  inert rather than acting on the wrong Page — see CardEditingContext.tsx's
   *  ownerPageCard doc comment. */
  ownerPageCard?: PageCardWithCard;
  onRunActionJob?: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => void;
  generatingPageCardId?: string | null;
  pageSiblings?: PageCardWithCard[];
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
    selectedEmbedIds,
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
    ownerPageCard,
    onRunActionJob,
    generatingPageCardId,
    pageSiblings,
  },
  ref,
) {
  const lastEmittedContent = useRef(content);
  const containerRef = useRef<HTMLDivElement>(null);
  // actionField's never-persisted values (see CardEditingContext.tsx's doc comment)
  // — a plain mutable ref rather than state, since updating it should never itself
  // trigger a re-render of this whole rich-text tree on every keystroke in an
  // unrelated field.
  const actionFieldValues = useRef<Map<number, string>>(new Map());
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

  // Same tr.setMeta pattern, for the Dock's Quote highlights
  // (SelectionHighlightDecoration.ts) — unlike annotations above, this renders in
  // *both* modes (a Card can be part of the Dock's selection while being edited
  // too), so there's no editable-gating here. Only this Card's own Quotes (several
  // can coexist within it).
  const quotes = useQuotes();
  // Which Quote's own highlight was last clicked, if any — purely local to this
  // CardRichText instance (not a shared registry): it only ever drives this one
  // small "remove this Quote" popup, rendered right below.
  const [quotePopup, setQuotePopup] = useState<{ id: string; top: number; left: number } | null>(null);
  // Briefly swaps the popup's copy button icon to a checkmark as feedback — reset
  // whenever a different Quote's highlight is clicked (see the click handler below),
  // same convention as SelectionMenu.tsx's own `copied` state.
  const [quotePopupCopied, setQuotePopupCopied] = useState(false);
  const ownQuoteEntries: SelectionHighlightEntry[] = quotes
    .filter((q) => q.cardId === cardId)
    .map((q) => ({ id: q.id, anchor: q.text, targeted: q.id === quotePopup?.id }));
  const ownQuoteEntriesKey = ownQuoteEntries.map((e) => `${e.id}:${e.anchor}:${e.targeted}`).join(" ");
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(selectionHighlightKey, ownQuoteEntries));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, ownQuoteEntriesKey]);

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

  // Same event-delegation pattern as above, for a Quote's own highlight
  // (SelectionHighlightDecoration.ts stamps a `data-quote-id` on each) — opens the
  // small local "remove this Quote" popup rendered below, positioned at the clicked
  // highlight's own rect.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function handleClick(e: MouseEvent) {
      const target = (e.target as Element).closest<HTMLElement>(".selection-highlight");
      if (!target) return;
      e.stopPropagation();
      const rect = target.getBoundingClientRect();
      setQuotePopup({ id: target.dataset.quoteId!, top: rect.top, left: rect.left + rect.width / 2 });
      setQuotePopupCopied(false);
    }
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, []);

  // Dismiss the "remove this Quote" popup on any click outside it — same
  // click-away convention as SelectionMenu.tsx's own dismiss effect.
  useEffect(() => {
    if (!quotePopup) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (!target.closest(".card-quote-popup")) {
        setQuotePopup(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [quotePopup]);

  useImperativeHandle(ref, () => ({
    editor,
    insertEmbed(cardIdToInsert: string) {
      editor?.chain().focus().insertContent({ type: "cardEmbed", attrs: { cardId: cardIdToInsert } }).run();
    },
  }));

  const contextValue: CardEditingContextValue = {
    ancestorIds,
    depth,
    selectedEmbedIds,
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
    editable,
    ownerPageCard,
    onRunActionJob,
    generatingPageCardId,
    pageSiblings,
    registerActionFieldValue: (pos, value) => {
      actionFieldValues.current.set(pos, value);
    },
    unregisterActionFieldValue: (pos) => {
      actionFieldValues.current.delete(pos);
    },
    getActionFieldValues: () =>
      [...actionFieldValues.current.entries()].sort(([a], [b]) => a - b).map(([, value]) => value),
  };

  // Same convention the old CardContent.tsx's AnnotatedText used: this and the
  // pre-existing annotation decorations/popovers only ever show in read mode —
  // there's nothing to annotate mid-edit. (A Quote's own highlight, unlike this
  // menu, renders in *both* modes — see the selectionHighlightKey effect above — so
  // editing a Card doesn't lose its existing Quote highlights, only this particular
  // "select new text" shortcut.)
  const selectionMenu = !editable && <SelectionMenu containerRef={containerRef} editor={editor} cardId={cardId} />;

  // Portaled the same way as SelectionMenu above — mounts inside a <p>
  // (AnnotatedText.tsx), and a <div> isn't valid HTML there.
  const quoteRemovePopup = quotePopup &&
    createPortal(
      <div
        className="selection-menu card-quote-popup"
        style={{ top: quotePopup.top, left: quotePopup.left }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="selection-menu__actions">
          <button
            type="button"
            className="selection-menu__action"
            aria-label={quotePopupCopied ? t("quickLookup.copied") : t("quickLookup.copy")}
            title={quotePopupCopied ? t("quickLookup.copied") : t("quickLookup.copy")}
            onClick={() => {
              const text = quotes.find((q) => q.id === quotePopup.id)?.text ?? "";
              navigator.clipboard
                .writeText(text)
                .then(() => setQuotePopupCopied(true))
                .catch(() => {});
            }}
          >
            <Icon name={quotePopupCopied ? "done" : "copy"} />
          </button>
          <button
            type="button"
            className="selection-menu__action"
            aria-label={t("quickLookup.dismiss")}
            title={t("quickLookup.dismiss")}
            onClick={() => {
              removeQuote(quotePopup.id);
              setQuotePopup(null);
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>,
      document.body,
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
      <div
        ref={containerRef}
        className="card-rich-text"
        data-card-id={cardId}
        // Only stopped for a nested embed (depth > 0), never for a top-level Card
        // (depth 0): CardEmbed.tsx's own container still reserves plain-click/
        // double-click selection-and-edit for its "blank space" (header/margins)
        // the same way it always has — an embed is its own independently
        // selectable/editable thing nested inside another Card's content, so a
        // click on ITS OWN text must stop at the embed's own boundary rather than
        // bubbling out to select/edit an ancestor embed or the top-level Card. A
        // top-level Card has no such ancestor to protect against: its own CardShell
        // resolves selection from the pointer gesture instead (`.card-embed` is one
        // of useCardSelectGesture.ts's own exclusions, so a *further* ancestor
        // Card's gesture already ignores anything inside this depth's embed
        // regardless of what happens here), and a double-click is free to fall
        // through to the browser's native word-selection (SelectionMenu.tsx) since
        // depth 0 doesn't wire an onDoubleClick handler at all.
        onClick={depth === 0 ? undefined : (e) => e.stopPropagation()}
        onDoubleClick={depth === 0 ? undefined : (e) => e.stopPropagation()}
      >
        <EditorContent editor={editor} />
        {editor?.isEmpty && !editable && placeholder && (
          <p className="card__preview card-rich-text__empty">{placeholder}</p>
        )}
        {selectionMenu}
        {quoteRemovePopup}
        {annotationPopover}
      </div>
    </CardEditingContext.Provider>
  );
});
