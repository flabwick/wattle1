import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Page, PageSummary } from "@wattle/shared";
import { PopoverItem, PopoverSearch, PopoverSurface } from "../primitives/index.js";
import { useDismiss } from "../../hooks/useDismiss.js";
import { searchPages, resolvePageByTitle } from "../../api/client.js";
import { t } from "../../i18n/index.js";
import "./CardLinkPicker.css";

interface PageLinkPickerProps {
  onSelect: (page: Page | PageSummary) => void;
  onClose: () => void;
  /** Same "escape the Dock's own horizontal scroll clipping" reasoning as
   *  CardLinkPicker's identical prop. */
  style?: CSSProperties;
  excludeSelector?: string;
}

/**
 * A small anchored popover for inserting a Page link (Pages + Links + Search
 * rebuild, Phase 2) — same search-as-you-type shape as CardLinkPicker, plus the
 * wiki-style "link to a missing title → create it" row: typing a title with no exact
 * match offers "Create Page '<title>'", which find-or-creates it server-side
 * (pageLinkService.resolveOrCreatePageByTitle) so the link never dangles.
 */
export function PageLinkPicker({ onSelect, onClose, style, excludeSelector }: PageLinkPickerProps) {
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<PageSummary[]>([]);
  const rootRef = useDismiss<HTMLDivElement>(onClose, { excludeSelector });

  useEffect(() => {
    const handle = setTimeout(() => {
      searchPages(query || undefined).then(setPages).catch(() => setPages([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const exactMatch = pages.some((p) => (p.title ?? "").trim().toLowerCase() === query.trim().toLowerCase());

  async function handleCreate() {
    const page = await resolvePageByTitle(query);
    onSelect(page);
  }

  return (
    <PopoverSurface ref={rootRef} className="card-link-picker" style={style}>
      <PopoverSearch
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("pages.linkPicker.searchPlaceholder")}
      />
      <ul className="card-link-picker__list">
        {query.trim() !== "" && !exactMatch && (
          <li>
            <PopoverItem icon="plus" onClick={handleCreate}>
              <span className="card-link-picker__item-title">
                {t("pages.linkPicker.create")} "{query.trim()}"
              </span>
            </PopoverItem>
          </li>
        )}
        {pages.map((page) => (
          <li key={page.id}>
            <PopoverItem icon="pages" onClick={() => onSelect(page)}>
              <span className="card-link-picker__item-title">{page.title || page.preview}</span>
            </PopoverItem>
          </li>
        ))}
        {pages.length === 0 && query.trim() === "" && (
          <li className="popover-empty">{t("pages.linkPicker.empty")}</li>
        )}
      </ul>
    </PopoverSurface>
  );
}
