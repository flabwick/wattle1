import type { ZodSchema } from "zod";

/**
 * What an Operation's `execute` gets called with. Kept minimal and loosely typed here —
 * `prisma` is `unknown` because the concrete PrismaClient type is generated inside
 * @wattle/api and shared must not depend on it. Callers in @wattle/api cast it back to
 * PrismaClient (or, more often, just rely on the service functions they call from
 * `execute`, which already import the singleton client directly).
 */
export interface OperationContext {
  prisma: unknown;
}

/**
 * A single named mutation/action the app can perform, independent of any particular
 * HTTP route. Registering an Operation is how new actions get added without editing
 * the route handlers that already exist.
 */
export interface Operation<TPayload = unknown, TResult = unknown> {
  /** Unique key, e.g. "card.rename". */
  id: string;
  payloadSchema: ZodSchema<TPayload>;
  execute: (ctx: OperationContext, payload: TPayload) => Promise<TResult>;
}

export class OperationRegistry {
  private readonly operations = new Map<string, Operation<any, any>>();

  register(op: Operation<any, any>): void {
    if (this.operations.has(op.id)) {
      throw new Error(`Operation "${op.id}" is already registered`);
    }
    this.operations.set(op.id, op);
  }

  get(id: string): Operation<any, any> {
    const op = this.operations.get(id);
    if (!op) {
      throw new Error(`Operation "${id}" is not registered`);
    }
    return op;
  }

  list(): Operation<any, any>[] {
    return [...this.operations.values()];
  }
}

export const operationRegistry = new OperationRegistry();
