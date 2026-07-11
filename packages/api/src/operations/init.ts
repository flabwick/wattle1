import { operationRegistry } from "@wattle/shared";
import { cardDeleteOperation } from "./cardDelete.js";
import { cardEditOperation } from "./cardEdit.js";
import { cardGenerateAcceptOperation } from "./cardGenerateAccept.js";
import { cardRenameOperation } from "./cardRename.js";
import { cardReorderOperation } from "./cardReorder.js";
import { cardSaveOperation } from "./cardSave.js";

let initialized = false;

/**
 * Registers every built-in Operation. Call once at server startup (src/index.ts) before
 * routes are mounted. Safe to call more than once — subsequent calls are no-ops.
 */
export function initOperations(): void {
  if (initialized) return;
  operationRegistry.register(cardRenameOperation);
  operationRegistry.register(cardDeleteOperation);
  operationRegistry.register(cardReorderOperation);
  operationRegistry.register(cardEditOperation);
  operationRegistry.register(cardSaveOperation);
  operationRegistry.register(cardGenerateAcceptOperation);
  initialized = true;
}
