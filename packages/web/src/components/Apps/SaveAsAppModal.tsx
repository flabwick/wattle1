import { useState } from "react";
import { Button, InputField, Overlay } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./Apps.css";

interface SaveAsAppModalProps {
  onSubmit: (name: string, description: string) => void;
  onClose: () => void;
}

/**
 * "Save as App" (Apps feature spec §5) — a minimal name + optional description form.
 * Only ever used for the initial save: while editingAppId is set, re-triggering
 * "Save as App" updates that same App directly (App.tsx's handleSaveAsApp), skipping
 * this modal entirely, since there's nothing new to ask for. Rendered as a centered
 * Overlay rather than an anchored popover, since a name/description form isn't
 * anchored to any one trigger button.
 */
export function SaveAsAppModal({ onSubmit, onClose }: SaveAsAppModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit(name.trim(), description.trim());
  }

  return (
    <Overlay onClose={onClose} className="apps-modal">
      <h2 className="apps-modal__title">{t("apps.modal.title")}</h2>
      <InputField
        value={name}
        autoFocus
        placeholder={t("apps.modal.namePlaceholder")}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
      />
      <InputField
        multiline
        value={description}
        placeholder={t("apps.modal.descriptionPlaceholder")}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="apps-modal__actions">
        <Button onClick={onClose}>{t("apps.modal.cancel")}</Button>
        <Button variant="primary" disabled={!name.trim()} onClick={handleSubmit}>
          {t("apps.modal.save")}
        </Button>
      </div>
    </Overlay>
  );
}
