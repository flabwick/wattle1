import type { PageSummary } from "@wattle/shared";
import { Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./HomesPanel.css";

interface HomesPanelProps {
  /** Every Home — any Page with no parent (Homes + Pages hierarchy, Phase 1's
   *  own structural definition; not to be confused with `pages.home`'s single
   *  designated `homePageId` — a Page can be one of *these* without ever being
   *  *the* Home). Same list `useVault.ts` already fetches for the Vault panel's
   *  own zero-match empty state — this panel is just a second, dedicated place
   *  to reach it from. */
  homes: PageSummary[];
  currentPageId: string | null;
  onOpenPage: (id: string) => void;
  onCreateHome: () => void;
}

/**
 * The Homes panel (Dock's own idle-row Home button) — every structural Home in
 * the system, pick one to jump to, or make a new one. Deliberately separate from
 * PagesPanel.tsx (Home + the pin rail): that panel is about *the* one designated
 * landing Home plus a short curated list of pins; this one is about *every* Home
 * that exists, an open-ended and potentially longer list, closer in spirit to
 * Vault's own flat-list-of-results panels.
 */
export function HomesPanel({ homes, currentPageId, onOpenPage, onCreateHome }: HomesPanelProps) {
  return (
    <div className="homes-panel">
      <button type="button" className="homes-panel__create" onClick={onCreateHome}>
        <Icon name="plus" />
        {t("vault.createHome")}
      </button>
      {homes.length === 0 && <p className="homes-panel__empty">{t("pages.noHomes")}</p>}
      {homes.map((home) => (
        <button
          key={home.id}
          type="button"
          className={`homes-panel__item${home.id === currentPageId ? " homes-panel__item--current" : ""}`}
          onClick={() => onOpenPage(home.id)}
        >
          <Icon name="home" className="homes-panel__item-icon" />
          <span className="homes-panel__preview">{home.title || home.preview || t("common.untitled")}</span>
        </button>
      ))}
    </div>
  );
}
