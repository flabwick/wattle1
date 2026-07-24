import { cardTypeRegistry } from "./cardType.js";
import { noteCardTypeDefinition } from "./definitions/noteCardType.js";
import { linkCardTypeDefinition } from "./definitions/linkCardType.js";
import { fileCardTypeDefinition } from "./definitions/fileCardType.js";
import { stackCardTypeDefinition } from "./definitions/stackCardType.js";

let initialized = false;

/**
 * Registers every built-in CardType. Both @wattle/api and @wattle/web call this once at
 * startup, before anything calls cardTypeRegistry.get/list. Safe to call more than once —
 * subsequent calls are no-ops, since register() would otherwise throw on a duplicate id.
 */
export function initCardTypes(): void {
  if (initialized) return;
  cardTypeRegistry.register(noteCardTypeDefinition);
  cardTypeRegistry.register(linkCardTypeDefinition);
  cardTypeRegistry.register(fileCardTypeDefinition);
  cardTypeRegistry.register(stackCardTypeDefinition);
  initialized = true;
}
