import { useEffect, useState } from "react";
import type { PageCardWithCard } from "@wattle/shared";
import "./Dock.css";

interface DockProps {
  selected: PageCardWithCard | null;
  generating: boolean;
  onChangeDraft: (draft: { title?: string; content?: string }) => void;
  onSave: () => void;
  onRemoveFromPage: () => void;
  onDeleteEntirely: () => void;
  onGenerate: () => void;
}

/**
 * Sticky footer, state-dependent (spec1.md Part 2 "The Dock" / Part 3 MVP spec):
 * nothing selected -> minimal state; a Card selected -> its edit + generate actions,
 * reachable one-handed at the bottom of the screen.
 */
export function Dock({
  selected,
  generating,
  onChangeDraft,
  onSave,
  onRemoveFromPage,
  onDeleteEntirely,
  onGenerate,
}: DockProps) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [selected?.id]);

  if (!selected) {
    return (
      <footer className="dock dock--empty">
        <span>Select a Card to edit or generate</span>
      </footer>
    );
  }

  const title = selected.draftTitle ?? selected.card.title;
  const content = selected.draftContent ?? selected.card.content;
  const hasUnsavedDraft = selected.draftTitle !== null || selected.draftContent !== null;

  if (editing) {
    return (
      <footer className="dock dock--editing">
        <input
          className="dock__title-input"
          value={title}
          placeholder="Title"
          onChange={(e) => onChangeDraft({ title: e.target.value })}
        />
        <textarea
          className="dock__content-input"
          value={content}
          placeholder="Write..."
          onChange={(e) => onChangeDraft({ content: e.target.value })}
        />
        <div className="dock__row">
          <button type="button" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="dock">
      <div className="dock__title" onClick={() => setEditing(true)}>
        {title || "Untitled"}
      </div>
      <div className="dock__row">
        <button type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" onClick={onSave} disabled={!hasUnsavedDraft}>
          Save
        </button>
        <button type="button" onClick={onGenerate} disabled={generating}>
          {generating ? "Generating…" : "Generate"}
        </button>
        <button type="button" onClick={onRemoveFromPage}>
          Remove
        </button>
        <button type="button" className="dock__danger" onClick={onDeleteEntirely}>
          Delete
        </button>
      </div>
    </footer>
  );
}
