/** Renders a context value into the literal string sent to a ModelProvider. */
export interface PromptTemplate {
  /** Unique key, e.g. "generate-from-context". */
  id: string;
  render(context: unknown): string;
}

export class PromptTemplateRegistry {
  private readonly templates = new Map<string, PromptTemplate>();

  register(template: PromptTemplate): void {
    if (this.templates.has(template.id)) {
      throw new Error(`PromptTemplate "${template.id}" is already registered`);
    }
    this.templates.set(template.id, template);
  }

  get(id: string): PromptTemplate {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error(`PromptTemplate "${id}" is not registered`);
    }
    return template;
  }

  list(): PromptTemplate[] {
    return [...this.templates.values()];
  }
}

export const promptTemplateRegistry = new PromptTemplateRegistry();

/**
 * A GenerationContextEntry (from @wattle/shared), duplicated structurally here so this
 * package doesn't need to depend on @wattle/shared just for one field list.
 */
interface ContextEntry {
  title: string;
  content: string;
}

/**
 * generationService.ts's stub callModel() never actually built a model prompt — it only
 * formatted a titles-only summary for its canned response text
 * (`context.map(c => \`- ${c.title}\`).join("\n")`). That isn't enough to drive a real
 * provider, which needs each Card's content, not just its title. This keeps the same
 * "- title" list style for readability but includes content, since that's the minimum
 * needed for a real generation to be based on the actual context.
 */
promptTemplateRegistry.register({
  id: "generate-from-context",
  render: (context) => {
    const entries = context as ContextEntry[];
    if (entries.length === 0) return "(no context above)";
    return entries
      .map((c) => `- ${c.title}\n${c.content}`)
      .join("\n\n");
  },
});
