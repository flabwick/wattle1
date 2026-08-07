import { useState } from "react";
import type { Card, PageCardWithCard, PageSummary, SearchCardData, WebSearchResult } from "@wattle/shared";
import { Button, Icon, InputField } from "../../../primitives/index.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { listCards, searchPages, searchWeb, extractWebPages } from "../../../../api/client.js";
import { navigateToPageFromRichText } from "../../../../lib/pageNavRegistry.js";
import { quickAddToPage } from "../../../../lib/quickAddRegistry.js";
import { convertMarkdownToWattleHtml } from "../../../../lib/markdownToWattleHtml.js";
import { t } from "../../../../i18n/index.js";
import "./SearchCard.css";

const MODES: readonly SearchCardData["mode"][] = ["vault", "web"];

/**
 * The "search" CardType's actual content, shared by SearchCardView.tsx and
 * SearchCardEditor.tsx — nothing meaningfully differs between "selected" and
 * "selected + editing" here, same precedent as PromptCardBody.tsx/StackBody.tsx.
 * Two modes: "vault" reuses the same search the Vault panel itself runs
 * (cardService.listCards/pageService.searchPages — Page hits open-on-click, same
 * convention as everywhere else Pages surface in search); "web" is Tavily
 * (webSearchService.ts), gated on TAVILY_API_KEY being set — shows a plain "not set
 * up yet" notice instead of results until it is. Mode/query write straight through via
 * cardStore.editCard on every change (no draft); results are always fetched fresh,
 * never persisted — reopening a saved search card re-runs it rather than showing a
 * stale snapshot.
 */
export function SearchCardBody({ pageCard }: { pageCard: PageCardWithCard }) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const search = canonicalCard.metadata.search ?? { mode: "vault" as const, query: "" };

  const [pageResults, setPageResults] = useState<PageSummary[]>([]);
  const [cardResults, setCardResults] = useState<Card[]>([]);
  const [webResults, setWebResults] = useState<WebSearchResult[]>([]);
  const [webConfigured, setWebConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  /** Web-mode only — which result URLs are ticked for the "export selected results
   *  as a Card" action below. Cleared on every fresh search (a stale selection
   *  pointing at results no longer on screen would be confusing to act on). */
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  function setMode(mode: SearchCardData["mode"]) {
    editCard(pageCard.card.id, { metadata: { ...canonicalCard.metadata, search: { ...search, mode } } });
  }

  function setQuery(query: string) {
    editCard(pageCard.card.id, { metadata: { ...canonicalCard.metadata, search: { ...search, query } } });
  }

  async function runSearch() {
    setLoading(true);
    setSelectedUrls(new Set());
    setExportError(null);
    try {
      if (search.mode === "vault") {
        const q = search.query.trim() || undefined;
        const [cards, pages] = await Promise.all([listCards(q), searchPages(q)]);
        setCardResults(cards);
        setPageResults(pages);
      } else {
        const res = await searchWeb(search.query.trim());
        setWebResults(res.results);
        setWebConfigured(res.configured);
      }
    } finally {
      setHasSearched(true);
      setLoading(false);
    }
  }

  function toggleResultSelected(url: string) {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  /** The "export selected results as a Card" action — full page text (Tavily's
   *  /extract, via webSearchService.ts), converted from markdown into Wattle's own
   *  rich-text HTML (lib/markdownToWattleHtml.ts, the same conversion Dock.tsx's
   *  Convert action already uses for imported markdown files), one new Card per
   *  successfully extracted URL, each appended to the bottom of the current Page
   *  (lib/quickAddRegistry.ts's addToPage — same "reach App.tsx without prop
   *  drilling" mechanism the rich-text quick-lookup row already uses). A URL Tavily
   *  couldn't extract is reported in `exportError` rather than silently dropped;
   *  the ones that *did* succeed are still added either way. */
  async function exportSelected() {
    const urls = [...selectedUrls];
    if (urls.length === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await extractWebPages(urls);
      if (!res.configured) {
        setExportError(t("searchCard.webPending"));
        return;
      }
      for (const result of res.results) {
        const { html } = convertMarkdownToWattleHtml(result.content);
        const fallbackTitle = webResults.find((r) => r.url === result.url)?.title;
        quickAddToPage(html, result.title ?? fallbackTitle ?? "");
      }
      if (res.failed.length > 0) {
        setExportError(`${t("searchCard.exportFailedPrefix")} ${res.failed.map((f) => f.url).join(", ")}`);
      }
      setSelectedUrls((prev) => {
        const next = new Set(prev);
        for (const result of res.results) next.delete(result.url);
        return next;
      });
    } catch {
      setExportError(t("searchCard.exportFailedGeneric"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="search-card">
      <div className="search-card__modes">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            className={`search-card__mode${search.mode === mode ? " search-card__mode--active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setMode(mode);
            }}
          >
            {t(`searchCard.mode.${mode}`)}
          </button>
        ))}
      </div>
      <div className="search-card__query-row">
        <InputField
          className="search-card__query"
          value={search.query}
          placeholder={t(search.mode === "vault" ? "searchCard.vaultPlaceholder" : "searchCard.webPlaceholder")}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
        />
        <Button
          iconOnly
          aria-label={t("searchCard.run")}
          title={t("searchCard.run")}
          onClick={(e) => {
            e.stopPropagation();
            void runSearch();
          }}
        >
          <Icon name="search" spin={loading} />
        </Button>
      </div>

      {!loading && hasSearched && search.mode === "vault" && (
        <ul className="search-card__results">
          {pageResults.map((page) => (
            <li key={`page-${page.id}`}>
              <button
                type="button"
                className="search-card__result search-card__result--page"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToPageFromRichText(page.id);
                }}
              >
                <Icon name="pages" />
                {page.title || page.preview}
              </button>
            </li>
          ))}
          {cardResults.map((card) => (
            <li key={`card-${card.id}`} className="search-card__result search-card__result--card">
              <Icon name="file" />
              {card.title}
            </li>
          ))}
          {pageResults.length === 0 && cardResults.length === 0 && (
            <li className="search-card__empty">{t("searchCard.empty")}</li>
          )}
        </ul>
      )}

      {!loading && hasSearched && search.mode === "web" && (
        webConfigured ? (
          <>
            {selectedUrls.size > 0 && (
              <div className="search-card__export-row">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    void exportSelected();
                  }}
                  disabled={exporting}
                >
                  <Icon name="plus" spin={exporting} />
                  {t("searchCard.exportSelected")} ({selectedUrls.size})
                </Button>
              </div>
            )}
            {exportError && <p className="search-card__error">{exportError}</p>}
            <ul className="search-card__results">
              {webResults.map((result) => (
                <li key={result.url} className="search-card__result-row">
                  <button
                    type="button"
                    className={`search-card__result-check${
                      selectedUrls.has(result.url) ? " search-card__result-check--checked" : ""
                    }`}
                    aria-label={t(
                      selectedUrls.has(result.url) ? "searchCard.deselectResult" : "searchCard.selectResult",
                    )}
                    title={t(
                      selectedUrls.has(result.url) ? "searchCard.deselectResult" : "searchCard.selectResult",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleResultSelected(result.url);
                    }}
                  >
                    {selectedUrls.has(result.url) && <Icon name="done" />}
                  </button>
                  <a
                    className="search-card__result search-card__result--web"
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="search-card__result-title">{result.title}</span>
                    <span className="search-card__result-snippet">{result.snippet}</span>
                  </a>
                </li>
              ))}
              {webResults.length === 0 && <li className="search-card__empty">{t("searchCard.empty")}</li>}
            </ul>
          </>
        ) : (
          <p className="search-card__pending">{t("searchCard.webPending")}</p>
        )
      )}
    </div>
  );
}
