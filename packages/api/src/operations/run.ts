import { operationRegistry } from "@wattle/shared";
import { prisma } from "../db.js";

/** Looks up an Operation, validates the raw payload against its schema, and executes it. */
export async function runOperation<TResult = unknown>(
  id: string,
  rawPayload: unknown,
): Promise<TResult> {
  const operation = operationRegistry.get(id);
  const payload = operation.payloadSchema.parse(rawPayload);
  return operation.execute({ prisma }, payload) as Promise<TResult>;
}
