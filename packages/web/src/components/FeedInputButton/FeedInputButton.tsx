import { useEffect, useRef, useState } from "react";
import { cardTypeRegistry } from "@wattle/shared";
import { Icon } from "../primitives/index.js";
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
  /** Uploads a file as a new file-typed Card. Unused while showMoreOptions is false. */
  onUploadFile?: (file: File) => void;
  /** Creates a new Stack Card (registries/definitions/stackCardType.ts) — the type
   *  picker's "Stack" option is wired straight to this rather than the stub
   *  highlight-only behavior every other type still has below, since a Stack needs
   *  its own creation endpoint (stackService.createStackInPage), not plain
   *  onAddCard. Optional/no-op when absent (the Dock Card panel's own creation flow,
   *  showGenerate false, has no Page for a Stack to belong to). */
  onAddStack?: () => void;
  /** False inside the Dock Card panel's own creation flow (Step 6 spec §3.3): Dock
   *  Cards have no Page/Tab to draw generation context from, so there's no Circle —
   *  Add is the only way a Card actually gets created either way. */
  showGenerate?: boolean;
  /** False for a blank Stack alternate's own Feed Input Button (StackBody.tsx):
   *  "Open from Vault"/"Upload File"/the card-type picker all assume they're
   *  creating a brand new top-level Card, which doesn't apply to filling in a Card
   *  that already exists (the alternate itself) — so the ellipsis has nothing left
   *  to show and is hidden entirely rather than opening onto an empty popup.
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
 * typed (blank if nothing has been); the ellipsis opens a small popup above it with
 * the rest — Open from Vault, Upload File, and the card-type picker — rather than a
 * row of buttons competing with Add for the same line.
 *
 * The type picker is a stub (spec §6 "Out of scope": card types beyond the existing
 * three aren't populated yet) — selecting one only changes this component's own local
 * highlight, since neither addNewCardToPage nor generation currently accept a forced
 * type override.
 */
export function FeedInputButton({
  generating,
  onStopGeneration,
  onGenerate,
  onAddCard,
  onOpenVault,
  onUploadFile,
  onAddStack,
  showGenerate = true,
  showMoreOptions = true,
  placeholder,
}: FeedInputButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [popupOpen, setPopupOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popupWrapRef = useRef<HTMLDivElement>(null);

  function collapse() {
    setExpanded(false);
    setText("");
    setPopupOpen(false);
    setTypePickerOpen(false);
  }

  // The popup floats over the page rather than sitting in document flow the way the
  // menu row it replaces did, so — same convention as CardLinkPicker/ProcessPicker —
  // it needs its own click-outside-to-close.
  useEffect(() => {
    if (!popupOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (popupWrapRef.current && !popupWrapRef.current.contains(e.target as Node)) {
        setPopupOpen(false);
        setTypePickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [popupOpen]);

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

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  return (
    <div className="feed-input">
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
          <div className="feed-input__popup-wrap" ref={popupWrapRef}>
            <button
              type="button"
              className="feed-input__ellipsis"
              onClick={() => setPopupOpen((open) => !open)}
              aria-label={t("feedInput.more")}
              title={t("feedInput.more")}
            >
              <Icon name={popupOpen ? "close" : "more"} />
            </button>
            {popupOpen && (
              <div className="feed-input__popup">
                <button
                  type="button"
                  onClick={handleOpen}
                  aria-label={t("feedInput.open")}
                  title={t("feedInput.open")}
                >
                  <Icon name="vault" />
                </button>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  aria-label={t("feedInput.upload")}
                  title={t("feedInput.upload")}
                >
                  <Icon name="upload" />
                </button>
                <div className="feed-input__type-wrap">
                  <button
                    type="button"
                    onClick={() => setTypePickerOpen((open) => !open)}
                    aria-label={t("feedInput.cardType")}
                    title={t("feedInput.cardType")}
                  >
                    <Icon name="file" />
                  </button>
                  {typePickerOpen && (
                    <div className="feed-input__type-picker">
                      {cardTypeRegistry.list().map((def) => (
                        <button
                          key={def.id}
                          type="button"
                          className={`feed-input__type-option${selectedTypeId === def.id ? " feed-input__type-option--selected" : ""}`}
                          onClick={() => {
                            if (def.id === "stack" && onAddStack) {
                              onAddStack();
                              collapse();
                              return;
                            }
                            setSelectedTypeId(def.id);
                            setTypePickerOpen(false);
                          }}
                        >
                          {def.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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
