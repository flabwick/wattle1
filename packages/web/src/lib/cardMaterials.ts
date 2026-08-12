import { CARD_MATERIAL_IDS, type CardMaterialId } from "@wattle/shared";
import { t } from "../i18n/index.js";

/** Display labels for the Card Materials feature's fixed vocabulary
 *  (@wattle/shared's CARD_MATERIAL_IDS) — consumed by CardInfoPanel.tsx's own
 *  background-material picker. */
const CARD_MATERIAL_LABELS: Record<CardMaterialId, string> = {
  parchment: t("cardMaterial.parchment"),
  oak: t("cardMaterial.oak"),
  walnut: t("cardMaterial.walnut"),
  leather: t("cardMaterial.leather"),
  leatherDark: t("cardMaterial.leatherDark"),
  slate: t("cardMaterial.slate"),
  brass: t("cardMaterial.brass"),
  oxblood: t("cardMaterial.oxblood"),
};

/** Render order for the picker — light/paper first, then wood, then the
 *  remaining accent/metal/stone materials. */
export const CARD_MATERIALS: ReadonlyArray<{ id: CardMaterialId; label: string }> = CARD_MATERIAL_IDS.map((id) => ({
  id,
  label: CARD_MATERIAL_LABELS[id],
}));
