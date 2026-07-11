import { z } from "zod";
import type { Operation } from "@wattle/shared";
import { initCardTypes, operationRegistry } from "@wattle/shared";
import { initCardTypeUi } from "./cardTypeUiInit.js";

let initialized = false;

/**
 * The ids of every Operation registered server-side in
 * packages/api/src/operations/init.ts. Duplicated here deliberately: the real
 * Operation objects there have an `execute` that imports Prisma-backed services
 * (packages/api/src/services/*.ts), which can't run in a browser bundle. The frontend
 * never calls `.execute()` — it always goes through packages/web/src/api/client.ts's
 * fetch calls to the HTTP endpoints that wrap those same server-side Operations — so
 * these client-side registrations exist purely so UI code (the Dock) can ask
 * "does this CardType support operation X?" via the same operationRegistry.list()
 * API the rest of the codebase uses, instead of a second hardcoded id list.
 */
const OPERATION_IDS = [
  "card.rename",
  "card.delete",
  "card.reorder",
  "card.edit",
  "card.save",
  "card.generateAccept",
] as const;

function notImplementedOnClient(id: string): Operation["execute"] {
  return async () => {
    throw new Error(`Operation "${id}" has no client-side implementation — call the HTTP API instead.`);
  };
}

/**
 * Registers CardTypes and (id-only) Operations for the browser. Call once at app
 * startup (see main.tsx). Safe to call more than once — subsequent calls are no-ops.
 */
export function initRegistries(): void {
  if (initialized) return;
  initCardTypes();
  initCardTypeUi();
  for (const id of OPERATION_IDS) {
    operationRegistry.register({
      id,
      payloadSchema: z.unknown(),
      execute: notImplementedOnClient(id),
    });
  }
  initialized = true;
}
