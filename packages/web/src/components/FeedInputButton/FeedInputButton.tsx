import { useRef, useState } from "react";
import { cardTypeUiRegistry } from "../../registries/cardTypeUi.js";
import { Icon } from "../primitives/index.js";
import { useDismiss } from "../../hooks/useDismiss.js";
import { t } from "../../i18n/index.js";
import "./FeedInputButton.css";

interface FeedInputButtonProps {
  /** True from the moment a generation starts until it's fully saved — the Circle
   *  becomes a Stop action while this is true, same convention as the Dock's old
   *  Generate/Stop toggle it replaces (see useGeneration.ts). Unused while
   *  showGenerate is false. */
  generating: boolean;
  onStopGeneration: () => void;
  /** Triggers a generation using the existing Generation Rule. `instruction`, if the
   *  expanded text field has content when Circle is tapped, is sent as a guided
   *  override (Step 6 spec §2.2 — compiled server-side via prompt-engine's
   *  "interactive" mode instead of the plain "generate" one). Unused while
   *  showGenerate is false. */
  onGenerate: (instruction?: string) => void;
  /** Creates a new Card directly (bypasses AI) — blank if `content` is empty. */
  onAddCard: (content: string) => void;
  /** Opens a Vault picker so the user can pick a Card to add. Unused while
   *  showMoreOptions is false. */
  onOpenVault?: () => void;
  /** "Create from a page" (Homes + Pages hierarchy, Phase 2) — a new child Page
   *  under the current one, with a link back to it. Not a CardType (no Card is
   *  created here), same "own tile, page-level action" shape as onOpenVault above,
   *  rendered alongside it rather than through cardTypeUiRegistry. Omitted (as on
   *  a Stack alternate's own Feed Input Button) where there's no current Page to
   *  nest a child under. */
  onCreateChildPage?: () => void;
  /** Uploads a file as a new file-typed Card. Unused while showMoreOptions is false. */
  onUploadFile?: (file: File) => void;
  /** Creates a new Stack Card (registries/definitions/stackCardType.ts) — the type
   *  picker's "Stack" tile is wired straight to this rather than plain onAddCard,
   *  since a Stack needs its own creation endpoint (stackService.createStackInPage).
   *  Optional/no-op-by-omission when absent (the Dock Card panel's own creation flow,
   *  showGenerate false, has no Page for a Stack to belong to) — the tile itself is
   *  simply left out of the picker rather than shown disabled. */
  onAddStack?: () => void;
  /** Creates a new "action"-typed Card (registries/definitions/actionCardType.ts) —
   *  same "own tile, own creator, omitted when absent" shape as onAddStack. */
  onAddAction?: () => void;
  /** Creates a new "prompt"-typed Card (registries/definitions/promptCardType.ts) —
   *  same shape as onAddAction above. */
  onAddPrompt?: () => void;
  /** Creates a new "pageLinks"-typed Card (registries/definitions/pageLinksCardType.ts)
   *  — same shape as onAddAction above. */
  onAddPageLinks?: () => void;
  /** Creates a new "search"-typed Card (registries/definitions/searchCardType.ts) —
   *  same shape as onAddAction above. */
  onAddSearch?: () => void;
  /** Creates a new "input"-typed Card (registries/definitions/inputCardType.ts) —
   *  same shape as onAddAction above. */
  onAddInput?: () => void;
  /** False inside the Dock Card panel's own creation flow (Step 6 spec §3.3): Dock
   *  Cards have no Page/Tab to draw generation context from, so there's no Circle —
   *  Add is the only way a Card actually gets created either way. */
  showGenerate?: boolean;
  /** False for a blank Stack alternate's own Feed Input Button (StackBody.tsx):
   *  "Open from Vault"/"Upload File"/the card-type picker all assume they're
   *  creating a brand new top-level Card, which doesn't apply to filling in a Card
   *  that already exists (the alternate itself) — so the ellipsis has nothing left
   *  to show and is hidden entirely rather than opening onto an empty box.
   *  Defaults true (every other call site). */
  showMoreOptions?: boolean;
  /** Overrides the collapsed placeholder text — the Page's own copy ("Guide the next
   *  generation…") doesn't make sense where there's no generation to guide. */
  placeholder?: string;
}

/**
 * The Feed Input Button (Step 6 spec §2) — reads as a plain line of placeholder text
 * sitting in the Page's own content (PageStack.tsx renders it below the lowest Card;
 * DockCardsPanel.tsx reuses it, showGenerate false, for its own "creating" view), not
 * a floating toolbar widget: no box, no border, no shadow. Tapping the placeholder
 * swaps it for a real inline text input in the same spot. Add (+) and the ellipsis
 * both sit on the right of that line: Add creates a Card straight from whatever's
 * typed (blank if nothing has been); the ellipsis turns the whole line into an inline
 * picker box (in document flow, not a floating popup) listing every card type the
 * current context can create, plus Open from Vault — tapping any tile creates or opens
 * that thing immediately and closes the box. There's no separate "Link" option: a Link
 * Card is a reference to an existing vault Card, exactly what Open from Vault already
 * does, so the two were the same option under different names.
 *
 * The type list itself comes from cardTypeUiRegistry's PickerTile per registered type
 * (one component per CardType, e.g. StackPickerTile/ActionCardPickerTile) — a tile
 * only appears when this Feed Input Button was actually given a way to create that
 * type (see the optional onAdd* props above), so the same component naturally shows
 * fewer options inside the Dock Card panel (no onAddStack/onAddAction/onAddPrompt
 * there today) than it does on a Page.
 */
export function FeedInputButton({
  generating,
  onStopGeneration,
  onGenerate,
  onAddCard,
  onOpenVault,
  onCreateChildPage,
  onUploadFile,
  onAddStack,
  onAddAction,
  onAddPrompt,
  onAddPageLinks,
  onAddSearch,
  onAddInput,
  showGenerate = true,
  showMoreOptions = true,
  placeholder,
}: FeedInputButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function collapse() {
    setExpanded(false);
    setText("");
    setPickerOpen(false);
  }

  // The picker box replaces the whole line in document flow rather than floating over
  // the page, but still needs its own click-outside-to-close — same convention
  // CardLinkPicker/ProcessPicker use for their own floating popups. No Escape here
  // (unlike those): deliberately unchanged from before this used useDismiss.
  const wrapRef = useDismiss<HTMLDivElement>(() => setPickerOpen(false), {
    enabled: pickerOpen,
    escape: false,
  });

  function handleCircleClick() {
    if (generating) {
      onStopGeneration();
      return;
    }
    onGenerate(text.trim() || undefined);
    collapse();
  }

  function handleAdd() {
    onAddCard(text.trim());
    collapse();
  }

  function handleOpen() {
    onOpenVault?.();
    collapse();
  }

  function handleCreateChildPage() {
    onCreateChildPage?.();
    collapse();
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  // Every card type this context can actually create — a type is only listed once
  // its own creator prop is present (see each prop's own doc comment above), so the
  // Dock Card panel's reuse of this component (no onAddStack/onAddAction/onAddPrompt)
  // naturally ends up with a shorter list than a Page's does. "Note" and "File" always
  // show: a blank note is always creatable via onAddCard, and Upload is always offered
  // wherever onUploadFile is.
  const typeOptions: Array<{ typeId: string; onSelect: () => void }> = [
    { typeId: "note", onSelect: () => { onAddCard(""); collapse(); } },
    ...(onUploadFile ? [{ typeId: "file", onSelect: handleUploadClick }] : []),
    ...(onAddStack ? [{ typeId: "stack", onSelect: () => { onAddStack(); collapse(); } }] : []),
    ...(onAddAction ? [{ typeId: "action", onSelect: () => { onAddAction(); collapse(); } }] : []),
    ...(onAddPrompt ? [{ typeId: "prompt", onSelect: () => { onAddPrompt(); collapse(); } }] : []),
    ...(onAddPageLinks ? [{ typeId: "pageLinks", onSelect: () => { onAddPageLinks(); collapse(); } }] : []),
    ...(onAddSearch ? [{ typeId: "search", onSelect: () => { onAddSearch(); collapse(); } }] : []),
    ...(onAddInput ? [{ typeId: "input", onSelect: () => { onAddInput(); collapse(); } }] : []),
  ];

  return (
    <div className="feed-input" ref={wrapRef}>
      {pickerOpen ? (
        <div className="feed-input__picker">
          <div className="feed-input__picker-header">
            <span className="feed-input__picker-title">{t("feedInput.pickType")}</span>
            <button
              type="button"
              className="feed-input__picker-close"
              onClick={() => setPickerOpen(false)}
              aria-label={t("feedInput.cancel")}
              title={t("feedInput.cancel")}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="feed-input__picker-grid">
            {onOpenVault && (
              <button type="button" className="card-type-picker-tile" onClick={handleOpen}>
                <Icon name="vault" />
                <span>{t("feedInput.open")}</span>
              </button>
            )}
            {onCreateChildPage && (
              <button type="button" className="card-type-picker-tile" onClick={handleCreateChildPage}>
                <Icon name="pages" />
                <span>{t("feedInput.newPage")}</span>
              </button>
            )}
            {typeOptions.map(({ typeId, onSelect }) => {
              const Tile = cardTypeUiRegistry.get(typeId).PickerTile;
              return <Tile key={typeId} onSelect={onSelect} />;
            })}
          </div>
        </div>
      ) : (
        <div className="feed-input__line">
          {showGenerate && (
            <button
              type="button"
              className="feed-input__circle"
              onClick={handleCircleClick}
              aria-label={generating ? t("feedInput.stopGeneration") : t("feedInput.generate")}
              title={generating ? t("feedInput.stopGeneration") : t("feedInput.generate")}
            >
              <Icon name={generating ? "stop" : "generate"} spin={generating} />
            </button>
          )}
          {expanded ? (
            <input
              className="feed-input__inline-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder ?? t("feedInput.placeholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") setExpanded(false);
              }}
            />
          ) : (
            <span className="feed-input__placeholder" onClick={() => setExpanded(true)}>
              {placeholder ?? t("feedInput.placeholder")}
            </span>
          )}
          <button
            type="button"
            className="feed-input__add"
            onClick={handleAdd}
            aria-label={t("feedInput.add")}
            title={t("feedInput.add")}
          >
            <Icon name="plus" />
          </button>
          {showMoreOptions && (
            <button
              type="button"
              className="feed-input__ellipsis"
              onClick={() => setPickerOpen(true)}
              aria-label={t("feedInput.more")}
              title={t("feedInput.more")}
            >
              <Icon name="more" />
            </button>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        className="feed-input__file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUploadFile?.(file);
          e.target.value = "";
          collapse();
        }}
      />
    </div>
  );
}
