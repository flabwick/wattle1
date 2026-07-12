/**
 * Incrementally parses a model's streamed text output against the generation
 * pipeline's output contract (see ../../prompts/README.md): exactly one root
 * `<card type="..." title="...">...</card>` block, which may contain any number of
 * nested `<card>` blocks at any depth. Nested cards aren't separate entities — they're
 * markup embedded in the root card's own content — but every event below still
 * identifies which block (root or nested, by id) it belongs to, so a consumer can
 * render them as visually distinct embedded cards without re-parsing anything itself.
 *
 * Stack-based: `open` pushes a frame, `close` pops it, `text` always belongs to
 * whichever frame is on top of the stack. Feed chunks as they arrive via `push()`, then
 * call `finish()` once the stream ends. A `<card ...>` or `</card>` tag split across two
 * `push()` calls is buffered and resolved correctly once the rest arrives — this is not
 * a whole-string Parser (see ./index.ts), it's stateful across calls.
 *
 * Different from the generic ParserRegistry's Parser interface (parse a complete
 * string once) on purpose: this has to make incremental progress as bytes arrive over
 * an SSE stream, and needs to track open/close state across many push() calls.
 */

export interface CardBlockOpenEvent {
  type: "open";
  /** Unique, ascending — identifies this block for its later `text`/`close` events,
   *  since a card's own title/type aren't unique within a stream. */
  id: number;
  /** id of the enclosing card block, or null for the root. */
  parentId: number | null;
  cardType: string;
  title: string;
}

export interface CardBlockTextEvent {
  type: "text";
  /** id of whichever block is currently open and receiving this text. */
  id: number;
  text: string;
}

export interface CardBlockCloseEvent {
  type: "close";
  id: number;
}

export interface CardBlockDoneEvent {
  type: "done";
  /** True when the stream ended before every opened `<card>` was properly closed
   *  (almost always the model hitting its maxTokens limit mid-response, not a parsing
   *  bug) and finish() recovered by auto-closing whatever was still open — see
   *  finish()'s doc comment. The consumer still gets a complete, acceptable ghost
   *  card; this only flags that it may be cut off content-wise. */
  truncated: boolean;
}

export interface CardBlockErrorEvent {
  type: "error";
  message: string;
}

export type CardBlockEvent =
  | CardBlockOpenEvent
  | CardBlockTextEvent
  | CardBlockCloseEvent
  | CardBlockDoneEvent
  | CardBlockErrorEvent;

interface StackFrame {
  id: number;
  cardType: string;
  title: string;
}

const TAG_REGEX = /<card\b[^>]*>|<\/card>/;
const ATTR_REGEX = /(\w+)="([^"]*)"/g;

export class CardBlockParser {
  private buffer = "";
  private stack: StackFrame[] = [];
  private nextId = 0;
  private rootOpened = false;
  private errored = false;

  /** Feed a chunk of streamed text; returns the events it produced. A no-op (returns
   *  []) once an error event has been emitted — the stream is considered dead. */
  push(chunk: string): CardBlockEvent[] {
    if (this.errored) return [];
    this.buffer += chunk;
    // TEMP DEBUG — remove once the truncated/unterminated-card-block issue is fully
    // characterized. Runs server-side (generationService.ts calls push() per model
    // chunk), so this only shows up in the terminal running `npm run dev`/`npm run
    // dev:api`, never in the browser console.
    console.debug(`[gen] push(): +${chunk.length} chars, buffer now ${this.buffer.length} chars`);
    return this.drain();
  }

  /**
   * Call once the underlying stream has ended.
   *
   * Used to hard-fail whenever the stream ended mid-tag or with any `<card>` block
   * still open, discarding everything generated so far. In practice that state is
   * overwhelmingly caused by the model simply hitting its `maxTokens` limit
   * mid-response, not a genuine parsing bug — and failing outright meant the user
   * lost the entire generation over what's usually just "the response ran a little
   * long." Now: a dangling partial tag fragment is dropped (it can't be recovered —
   * we don't even know what tag it was going to be) and any still-open `<card>`
   * blocks are auto-closed in place, so whatever text *did* stream in survives as a
   * normal, acceptable ghost card. The `done` event's `truncated` flag tells the
   * caller this happened, in case it wants to surface that (GhostCard.tsx does).
   * The one case that still hard-fails is no root `<card>` ever opening at all —
   * there's nothing to recover there, not even a partial card to show.
   */
  finish(): CardBlockEvent[] {
    if (this.errored) return [];
    console.debug(
      `[gen] finish(): bufferLen=${this.buffer.length} stackDepth=${this.stack.length} rootOpened=${this.rootOpened}`,
    );

    const events: CardBlockEvent[] = [];
    let truncated = false;

    if (this.buffer.length > 0) {
      // drain() only ever leaves a partial-tag prefix in the buffer (see
      // findPartialTagStart) — plain text is always flushed immediately. So this is
      // always a dangling `<card ...` or `</card` fragment cut off mid-tag, never
      // recoverable content.
      console.debug(`[gen] finish(): dropping dangling partial tag fragment: ${JSON.stringify(this.buffer)}`);
      this.buffer = "";
      truncated = true;
    }

    if (this.stack.length > 0) {
      console.debug(
        `[gen] finish(): auto-closing ${this.stack.length} unterminated <card> block(s) (ids: ${this.stack.map((f) => f.id).join(", ")}) — recovering rather than discarding the generation`,
      );
      while (this.stack.length > 0) {
        const frame = this.stack.pop()!;
        events.push({ type: "close", id: frame.id });
      }
      truncated = true;
    }

    if (!this.rootOpened) {
      console.debug("[gen] finish(): FAILING — no root <card> block ever opened, nothing to recover");
      return [this.fail("Stream ended with no root <card> block")];
    }

    events.push({ type: "done", truncated });
    console.debug(`[gen] finish(): done, truncated=${truncated}`);
    return events;
  }

  private drain(): CardBlockEvent[] {
    const events: CardBlockEvent[] = [];
    while (true) {
      const match = TAG_REGEX.exec(this.buffer);
      if (!match) {
        const partialAt = this.findPartialTagStart();
        if (partialAt === -1) {
          if (this.buffer) events.push(...this.emitText(this.buffer));
          this.buffer = "";
        } else {
          if (partialAt > 0) events.push(...this.emitText(this.buffer.slice(0, partialAt)));
          this.buffer = this.buffer.slice(partialAt);
        }
        return events;
      }

      if (match.index > 0) events.push(...this.emitText(this.buffer.slice(0, match.index)));
      const tag = match[0];
      this.buffer = this.buffer.slice(match.index + tag.length);

      const event = tag.startsWith("</") ? this.handleClose() : this.handleOpen(tag);
      events.push(event);
      if (this.errored) return events;
    }
  }

  /** Finds where a tag that's still arriving (split across chunk boundaries) starts,
   *  so its prefix isn't flushed out as literal text before the rest shows up. Returns
   *  -1 if the buffer's tail isn't the start of an in-progress <card>/</card> tag. */
  private findPartialTagStart(): number {
    const lastLt = this.buffer.lastIndexOf("<");
    if (lastLt === -1) return -1;
    const tail = this.buffer.slice(lastLt);
    if (tail.includes(">")) return -1;
    if ("<card".startsWith(tail) || tail.startsWith("<card")) return lastLt;
    if ("</card>".startsWith(tail) || tail.startsWith("</card")) return lastLt;
    return -1;
  }

  private emitText(text: string): CardBlockEvent[] {
    if (!text || this.stack.length === 0) return [];
    return [{ type: "text", id: this.stack[this.stack.length - 1].id, text }];
  }

  private handleOpen(tag: string): CardBlockEvent {
    if (this.stack.length === 0 && this.rootOpened) {
      return this.fail(
        "Unexpected second root <card> block — exactly one root card block is allowed.",
      );
    }

    const attrs: Record<string, string> = {};
    ATTR_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ATTR_REGEX.exec(tag))) attrs[m[1]] = m[2];

    const id = this.nextId++;
    const parentId = this.stack.length ? this.stack[this.stack.length - 1].id : null;
    const cardType = attrs.type ?? "note";
    const title = attrs.title ?? "";
    this.stack.push({ id, cardType, title });
    if (parentId === null) this.rootOpened = true;
    console.debug(
      `[gen] open id=${id} parentId=${parentId} type=${cardType} title=${JSON.stringify(title)} — stack depth now ${this.stack.length}`,
    );
    return { type: "open", id, parentId, cardType, title };
  }

  private handleClose(): CardBlockEvent {
    const frame = this.stack.pop();
    if (!frame) {
      console.debug("[gen] close FAILED — no open <card> block to close");
      return this.fail("Unexpected </card> with no open <card> block");
    }
    console.debug(`[gen] close id=${frame.id} — stack depth now ${this.stack.length}`);
    return { type: "close", id: frame.id };
  }

  private fail(message: string): CardBlockErrorEvent {
    console.debug(`[gen] fail(): ${message}`);
    this.errored = true;
    return { type: "error", message };
  }
}
