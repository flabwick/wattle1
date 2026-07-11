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
    return this.drain();
  }

  /** Call once the underlying stream has ended. Returns a final `done` event, or an
   *  `error` if a card block was left open or a tag was left incomplete. */
  finish(): CardBlockEvent[] {
    if (this.errored) return [];
    if (this.buffer.length > 0) {
      return [
        this.fail(`Stream ended with an incomplete <card> tag: ${JSON.stringify(this.buffer)}`),
      ];
    }
    if (this.stack.length > 0) {
      return [this.fail(`Stream ended with ${this.stack.length} unterminated <card> block(s)`)];
    }
    if (!this.rootOpened) {
      return [this.fail("Stream ended with no root <card> block")];
    }
    return [{ type: "done" }];
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
    return { type: "open", id, parentId, cardType, title };
  }

  private handleClose(): CardBlockEvent {
    const frame = this.stack.pop();
    if (!frame) {
      return this.fail("Unexpected </card> with no open <card> block");
    }
    return { type: "close", id: frame.id };
  }

  private fail(message: string): CardBlockErrorEvent {
    this.errored = true;
    return { type: "error", message };
  }
}
