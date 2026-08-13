import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// This file lives in packages/api/src, config/ is a sibling of src/.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(PACKAGE_ROOT, "config", "model.config.json");

export interface ProviderSettings {
  model: string;
  temperature: number;
  maxTokens: number;
}

interface ModelConfigFile {
  activeProvider?: string;
  /** Which model the vision/OCR path uses (fileExtractionService.ts) — a
   *  ModelRegistry id or a raw OpenRouter slug, resolved the same way
   *  openRouterProvider.ts's own model config is. Separate from `providers` above
   *  because OCR always wants a cheap vision-capable model regardless of which
   *  provider/model ordinary generation is configured to use. */
  visionModel?: string;
  providers: Record<string, ProviderSettings>;
}

/** Reads config/model.config.json fresh off disk on every call — no caching, no
 *  in-memory copy kept between calls — so editing the file changes provider/model/
 *  temperature/maxTokens on the very next generation, with no restart. */
function readConfig(): ModelConfigFile {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as ModelConfigFile;
}

/** The provider id named by the config file, if any. Takes priority over
 *  providers/init.ts's env-var-based selection in activeProviderId(). */
export function configuredProviderId(): string | undefined {
  return readConfig().activeProvider || undefined;
}

/** Model/temperature/maxTokens for the given provider id, or undefined if that
 *  provider has no entry in the config file. */
export function configuredProviderSettings(providerId: string): ProviderSettings | undefined {
  return readConfig().providers[providerId];
}

/** The vision/OCR model named by the config file, if any — see fileExtractionService.ts's
 *  own fallback chain (this, then VISION_MODEL_ID, then a hardcoded default). */
export function configuredVisionModel(): string | undefined {
  return readConfig().visionModel || undefined;
}
