import type { ZodSchema } from "zod";

/**
 * Describes a kind of Card: what data it holds, how that data is validated, and which
 * Operations (see operation.ts) it allows. Registering a CardTypeDefinition is how new
 * card types get added without editing the code that already handles existing ones.
 */
export interface CardTypeDefinition<TData = unknown> {
  /** Unique key, e.g. "note". */
  id: string;
  displayName: string;
  dataSchema: ZodSchema<TData>;
  defaultData: () => TData;
  /** Operation ids this type allows. `["*"]` means "all registered operations". */
  supportsOperations: string[];
}

export class CardTypeRegistry {
  private readonly definitions = new Map<string, CardTypeDefinition<any>>();

  /** Before adding a new CardType, see `registries/README.md` (this directory) and
   *  `docs/adding-features.md` at the repo root — the latter has the checklist of
   *  which of the app's LLM system prompts (packages/prompt-engine/prompts/) may
   *  need a look once your new type exists. */
  register(def: CardTypeDefinition<any>): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`CardType "${def.id}" is already registered`);
    }
    this.definitions.set(def.id, def);
  }

  get(id: string): CardTypeDefinition<any> {
    const def = this.definitions.get(id);
    if (!def) {
      throw new Error(`CardType "${id}" is not registered`);
    }
    return def;
  }

  /** For call sites that need to render/reason about *something* reasonable for a
   *  Card whose stored `metadata.typeId` doesn't match any currently-registered
   *  type (e.g. a leftover value from a CardType that's since been removed or
   *  renamed) rather than crashing on `.get()` — same convention
   *  CardTypeUiRegistry.has() already uses on the web-only UI registry (see
   *  PageStack.tsx's PageCardSlot). */
  has(id: string): boolean {
    return this.definitions.has(id);
  }

  list(): CardTypeDefinition<any>[] {
    return [...this.definitions.values()];
  }
}

export const cardTypeRegistry = new CardTypeRegistry();
