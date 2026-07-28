import { useEffect, useRef, useState } from "react";
import type { App } from "@wattle/shared";
import { Button } from "../primitives/index.js";
import { listApps } from "../../api/client.js";
import { t } from "../../i18n/index.js";
import "./Apps.css";

interface AppBrowserProps {
  onOpen: (app: App) => void;
  /** Hidden/disabled entirely for isCore Apps (Apps feature spec §4/§5) — enforced
   *  here for UI purposes only; appService.ts rejects it server-side regardless. */
  onEdit: (app: App) => void;
  onClose: () => void;
}

/**
 * A simple list of every App (Apps feature spec §5 — "a simple list is sufficient
 * for v1", no dedicated picker screen yet), each with Open and (non-core only) Edit.
 * Reached both from "New from App…" (FeedInputButton.tsx) and could later gain other
 * entry points without changing this component. Self-contained, same fetch-on-mount
 * convention as CardLinkPicker.tsx, rendered as the same kind of centered overlay as
 * SaveAsAppModal.tsx (no existing modal precedent to match instead — see that file).
 */
export function AppBrowser({ onOpen, onEdit, onClose }: AppBrowserProps) {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listApps()
      .then((next) => {
        setApps(next);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="apps-overlay"
      onPointerDown={(e) => {
        if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div ref={dialogRef} className="apps-modal apps-browser">
        <div className="apps-browser__header">
          <h2 className="apps-modal__title">{t("apps.browser.title")}</h2>
          <Button iconOnly onClick={onClose} aria-label={t("apps.browser.close")}>
            ×
          </Button>
        </div>
        {!loading && apps.length === 0 && <p className="apps-browser__empty">{t("apps.browser.empty")}</p>}
        <ul className="apps-browser__list">
          {apps.map((app) => (
            <li key={app.id} className="apps-browser__item">
              <div className="apps-browser__item-info">
                <span className="apps-browser__item-name">{app.name}</span>
                {app.description && <span className="apps-browser__item-desc">{app.description}</span>}
              </div>
              <div className="apps-browser__item-actions">
                <Button onClick={() => onOpen(app)}>{t("apps.browser.open")}</Button>
                {!app.isCore && <Button onClick={() => onEdit(app)}>{t("apps.browser.edit")}</Button>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
