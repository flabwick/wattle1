import { useEffect, useState } from "react";
import type { Template } from "@wattle/shared";
import { Button, Overlay } from "../primitives/index.js";
import { listTemplates } from "../../api/client.js";
import { t } from "../../i18n/index.js";
import "./Templates.css";

interface TemplateBrowserProps {
  onOpen: (template: Template) => void;
  /** Hidden/disabled entirely for isCore Templates — enforced here for UI purposes
   *  only; templateService.ts rejects it server-side regardless. */
  onEdit: (template: Template) => void;
  onClose: () => void;
}

/**
 * A simple list of every Template ("a simple list is sufficient for v1", no
 * dedicated picker screen yet), each with Open and (non-core only) Edit. Reached
 * both from "New from Template…" (FeedInputButton.tsx) and could later gain other
 * entry points without changing this component. Self-contained, same fetch-on-mount
 * convention as CardLinkPicker.tsx, rendered as the same kind of centered Overlay as
 * SaveAsTemplateModal.tsx.
 */
export function TemplateBrowser({ onOpen, onEdit, onClose }: TemplateBrowserProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTemplates()
      .then((next) => {
        setTemplates(next);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <Overlay onClose={onClose} className="templates-modal templates-browser">
      <div className="templates-browser__header">
        <h2 className="templates-modal__title">{t("templates.browser.title")}</h2>
        <Button iconOnly onClick={onClose} aria-label={t("templates.browser.close")}>
          ×
        </Button>
      </div>
      {!loading && templates.length === 0 && (
        <p className="templates-browser__empty">{t("templates.browser.empty")}</p>
      )}
      <ul className="templates-browser__list">
        {templates.map((template) => (
          <li key={template.id} className="templates-browser__item">
            <div className="templates-browser__item-info">
              <span className="templates-browser__item-name">{template.name}</span>
              {template.description && (
                <span className="templates-browser__item-desc">{template.description}</span>
              )}
            </div>
            <div className="templates-browser__item-actions">
              <Button onClick={() => onOpen(template)}>{t("templates.browser.open")}</Button>
              {!template.isCore && <Button onClick={() => onEdit(template)}>{t("templates.browser.edit")}</Button>}
            </div>
          </li>
        ))}
      </ul>
    </Overlay>
  );
}
