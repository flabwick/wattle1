import { useEffect, useRef, useState } from "react";
import { Button, InputField } from "../primitives/index.js";
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
 * this modal entirely, since there's nothing new to ask for. There's no other modal
 * in the app to match (see CardLinkPicker.tsx/ProcessPicker.tsx for the closest
 * anchored-popover precedent) — this is a centered, full-viewport overlay instead,
 * since a name/description form isn't anchored to any one trigger button.
 */
export function SaveAsAppModal({ onSubmit, onClose }: SaveAsAppModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit(name.trim(), description.trim());
  }

  return (
    <div
      className="apps-overlay"
      onPointerDown={(e) => {
        if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div ref={dialogRef} className="apps-modal">
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
      </div>
    </div>
  );
}
