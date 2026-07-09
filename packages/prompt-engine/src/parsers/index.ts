/** Parses a raw model-response string into structured data, and back. */
export interface Parser {
  /** Unique key, e.g. "json". */
  id: string;
  parse(raw: string): unknown;
  serialize(data: unknown): string;
}

export class ParserRegistry {
  private readonly parsers = new Map<string, Parser>();

  register(parser: Parser): void {
    if (this.parsers.has(parser.id)) {
      throw new Error(`Parser "${parser.id}" is already registered`);
    }
    this.parsers.set(parser.id, parser);
  }

  get(id: string): Parser {
    const parser = this.parsers.get(id);
    if (!parser) {
      throw new Error(`Parser "${id}" is not registered`);
    }
    return parser;
  }

  list(): Parser[] {
    return [...this.parsers.values()];
  }
}

export const parserRegistry = new ParserRegistry();

parserRegistry.register({
  id: "json",
  parse: (raw) => JSON.parse(raw),
  serialize: (data) => JSON.stringify(data),
});
