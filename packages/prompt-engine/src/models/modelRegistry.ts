/**
 * Registry id -> concrete OpenRouter model string, so callers (and env vars like
 * MODEL_ID) select a stable id instead of hardcoding a raw "vendor/model" string that
 * might change upstream.
 */
export interface ModelDefinition {
  /** Unique key, e.g. "claude-sonnet". Not the raw OpenRouter model string. */
  id: string;
  /** The literal "vendor/model" string OpenRouter's API expects. */
  openRouterModel: string;
  /** Human-readable name for UI (model pickers, logs). */
  label: string;
}

export class ModelRegistry {
  private readonly models = new Map<string, ModelDefinition>();

  register(model: ModelDefinition): void {
    if (this.models.has(model.id)) {
      throw new Error(`ModelDefinition "${model.id}" is already registered`);
    }
    this.models.set(model.id, model);
  }

  get(id: string): ModelDefinition {
    const model = this.models.get(id);
    if (!model) {
      throw new Error(`ModelDefinition "${id}" is not registered`);
    }
    return model;
  }

  list(): ModelDefinition[] {
    return [...this.models.values()];
  }
}

export const modelRegistry = new ModelRegistry();
