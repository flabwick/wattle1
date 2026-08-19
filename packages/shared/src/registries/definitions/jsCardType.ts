import { z } from "zod";
import type { CardTypeDefinition } from "../cardType.js";

/**
 * A sandboxed, DataviewJS-style live script — a whole Card whose "content" is a
 * JavaScript program (see cardMetadata.ts's own `js` field for the actual
 * per-Card data: just `source`, the script text). Runs inside an
 * `sandbox="allow-scripts"` iframe with no access to the rest of the app's DOM,
 * cookies, or network (packages/web/src/lib/wattleSandboxBootstrap.ts) — the
 * only way it can read or change the workspace is through the `wattle` object
 * that bootstrap builds, which itself only ever calls real API endpoints or
 * existing action jobs (wattleSdkHost.ts). See JsCardView.tsx for the actual
 * render (always live) and JsCardEditor.tsx for the code-editing face
 * (double-click, same convention every other CardType uses).
 */
export const jsCardDataSchema = z.object({
  source: z.string(),
});

export type JsCardData = z.infer<typeof jsCardDataSchema>;

export const jsCardTypeDefinition: CardTypeDefinition<JsCardData> = {
  id: "js",
  displayName: "JS",
  dataSchema: jsCardDataSchema,
  defaultData: () => ({ source: "" }),
  // Same rationale as searchCardType.ts: running a script isn't an
  // Operation-registry concern, and Save/Delete are the only vault-level
  // operations that make sense against a card whose whole content is a live
  // program rather than editable prose.
  supportsOperations: ["card.save", "card.delete"],
};
