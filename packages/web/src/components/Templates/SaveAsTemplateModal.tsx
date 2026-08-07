import { useState } from "react";
import { Button, InputField, Overlay } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./Templates.css";

interface SaveAsTemplateModalProps {
  onSubmit: (name: string, description: string) => void;
  onClose: () => void;
}

/**
 * "Save as Template" — a minimal name + optional description form. Only ever used
 * for the initial save: while editingTemplateId is set, re-triggering "Save as
 * Template" updates that same Template directly (App.tsx's handleSaveAsTemplate),
 * skipping this modal entirely, since there's nothing new to ask for. Rendered as a
 * centered Overlay rather than an anchored popover, since a name/description form
 * isn't anchored to any one trigger button.
 */
export function SaveAsTemplateModal({ onSubmit, onClose }: SaveAsTemplateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit(name.trim(), description.trim());
  }

  return (
    <Overlay onClose={onClose} className="templates-modal">
      <h2 className="templates-modal__title">{t("templates.modal.title")}</h2>
      <InputField
        value={name}
        autoFocus
        placeholder={t("templates.modal.namePlaceholder")}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
      />
      <InputField
        multiline
        value={description}
        placeholder={t("templates.modal.descriptionPlaceholder")}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="templates-modal__actions">
        <Button onClick={onClose}>{t("templates.modal.cancel")}</Button>
        <Button variant="primary" disabled={!name.trim()} onClick={handleSubmit}>
          {t("templates.modal.save")}
        </Button>
      </div>
    </Overlay>
  );
}
