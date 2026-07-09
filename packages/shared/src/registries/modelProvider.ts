/** One piece of a model's streamed response. `done: true` marks the final chunk. */
export interface Chunk {
  text: string;
  done: boolean;
}

/**
 * A source of model generations, independent of any particular HTTP route. Registering
 * a ModelProvider is how new providers (or a stub for local dev) get added without
 * editing the code that already calls into one.
 */
export interface ModelProvider {
  /** Unique key, e.g. "anthropic", "stub". */
  id: string;
  generate(prompt: string, opts?: Record<string, unknown>): AsyncIterable<Chunk>;
}

export class ModelProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`ModelProvider "${provider.id}" is already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: string): ModelProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`ModelProvider "${id}" is not registered`);
    }
    return provider;
  }

  list(): ModelProvider[] {
    return [...this.providers.values()];
  }
}

export const modelProviderRegistry = new ModelProviderRegistry();
