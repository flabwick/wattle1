import type { ActionStep } from "@wattle/shared";
import { actionJobRegistry, stepRefValue } from "./actionJobRegistry.js";

/**
 * A small, line-oriented text format an LLM can write (and this app can parse back
 * into real `ActionStep[]`) — the "language" half of the action-script system
 * (see actionScriptPrompt.ts for the other half, the system prompt that teaches a
 * model to write it). One line per step:
 *
 *   <jobId> key="quoted value with spaces" key2=bareToken key3=step:2
 *
 * `LABEL "..."` (optional, its own line) sets the button's own label. Blank lines
 * and lines starting with `#` are ignored. This is deliberately NOT a general
 * scripting language — same closed vocabulary the visual step editor
 * (CardInfoPanel.tsx) already enforces, just a text surface for writing it:
 *
 * - A "select" field's value must be one of that field's own option values.
 * - A "cardPicker"/"vaultCardPicker" field's value must be `step:<N>` — the
 *   1-based line number of an *earlier* step in the *same* script that creates a
 *   card (createCard/copyExistingCard/linkExistingCard). There's no way to name an
 *   arbitrary already-existing vault card from script text (nothing stable to
 *   spell — titles aren't unique, ids aren't guessable) — that still has to be
 *   picked by hand afterward, in the same per-step fields the script produced.
 * - A "pagePicker" field's value is a quoted Page title, resolved through
 *   `resolvePageTitle` (find-or-create, same as the picker UI's own PageLinkPicker)
 *   — omit the field entirely to mean "this button's own Page".
 * - A "templatePicker" field (only `openTemplate` has one) can't be written at all
 *   — a Template id isn't nameable either, and unlike a Page there's no
 *   find-or-create to lean on, so `openTemplate` is excluded from the vocabulary a
 *   script can use.
 */

export interface ActionScriptResult {
  label: string;
  steps: ActionStep[];
  errors: string[];
}

function makeStepId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Splits one line into tokens — a `key="quoted value with spaces"` pair (escapes:
 *  `\"`, `\\`) stays one token, everything else splits on whitespace as usual
 *  (`jobId`, a bare `key=value`, or the `LABEL` keyword itself). */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const re = /[^\s=]+="(?:\\.|[^"\\])*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) tokens.push(m[0]);
  return tokens;
}

function unquote(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return trimmed;
}

/** The reverse — wraps in quotes and escapes `"`/`\` only if the value actually
 *  needs it (has whitespace or a quote), so a plain enum value like `up` stays
 *  bare in serialized output, matching what a hand-written script would look like. */
function quote(value: string): string {
  if (value !== "" && !/[\s"]/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parsePairs(tokens: string[]): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq < 0) continue;
    pairs.set(token.slice(0, eq), token.slice(eq + 1));
  }
  return pairs;
}

/**
 * Parses action-script text into real steps. Async because a "pagePicker" field's
 * quoted title needs an actual find-or-create lookup (`resolvePageTitle`) to turn
 * into a Page id — everything else is pure text handling. Never throws: syntax and
 * validation problems collect into `errors` (one entry per offending line) so a
 * caller can show them (or hand them back to the model for a retry) instead of the
 * whole generation being an all-or-nothing failure.
 */
export async function parseActionScript(
  text: string,
  resolvePageTitle?: (title: string) => Promise<{ id: string; title: string | null }>,
): Promise<ActionScriptResult> {
  const lines = text.split("\n");
  const steps: ActionStep[] = [];
  const errors: string[] = [];
  const positionToId: string[] = [];
  let label = "";

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    if (/^LABEL\b/i.test(line)) {
      label = unquote(line.replace(/^LABEL\s*/i, ""));
      continue;
    }

    const tokens = tokenize(line);
    const jobId = tokens[0];
    const job = actionJobRegistry.get(jobId);
    if (!job) {
      errors.push(`Line ${lineNo}: unknown action "${jobId}"`);
      continue;
    }
    if (job.fields.some((f) => f.kind === "templatePicker")) {
      errors.push(`Line ${lineNo}: "${jobId}" can't be written in a script (no way to name a Template)`);
      continue;
    }

    const raw = parsePairs(tokens.slice(1));
    const jobParams: Record<string, unknown> = {};
    let lineOk = true;

    for (const field of job.fields) {
      const value = raw.get(field.key);
      if (value === undefined) continue;

      if (field.kind === "cardPicker" || field.kind === "vaultCardPicker") {
        const m = /^step:(\d+)$/.exec(value);
        const refPos = m ? Number(m[1]) : NaN;
        if (!m || refPos < 1 || refPos > positionToId.length) {
          errors.push(
            `Line ${lineNo}: "${field.key}" must be step:<N>, naming an earlier line in this same script that creates a card — got "${value}"`,
          );
          lineOk = false;
          continue;
        }
        // Both field kinds store the same `step:<id>` sentinel at this point —
        // ActionCardView.tsx's runSteps (via resolveStepReferences) is what turns
        // it into a real PageCard id (cardPicker) or Card id (vaultCardPicker) at
        // *run* time, once the referenced step has actually executed and really
        // has an id to give. Nothing to resolve yet here at parse time.
        const refId = positionToId[refPos - 1];
        jobParams[field.key] = stepRefValue(refId);
      } else if (field.kind === "pagePicker") {
        const title = unquote(value);
        if (!resolvePageTitle) continue;
        try {
          const page = await resolvePageTitle(title);
          jobParams[field.key] = page.id;
          jobParams[`${field.key}Title`] = page.title ?? title;
        } catch {
          errors.push(`Line ${lineNo}: couldn't resolve page "${title}"`);
          lineOk = false;
        }
      } else if (field.kind === "select") {
        const bare = unquote(value);
        if (!field.options.some((opt) => opt.value === bare)) {
          errors.push(
            `Line ${lineNo}: "${field.key}" must be one of ${field.options.map((o) => o.value).join("|")} — got "${bare}"`,
          );
          lineOk = false;
          continue;
        }
        jobParams[field.key] = bare;
      } else {
        jobParams[field.key] = unquote(value);
      }
    }

    if (!lineOk) continue;
    const stepId = makeStepId();
    steps.push({ id: stepId, jobId, jobParams });
    positionToId.push(stepId);
  }

  return { label, steps, errors };
}

/**
 * The reverse of parseActionScript — mainly so a "regenerate" request can show the
 * model its own prior output as editable context (actionScriptPrompt.ts's
 * `buildActionScriptUserMessage`), and as a plain-text preview if the UI ever wants
 * one. A `cardPicker`/`vaultCardPicker` value that isn't a `step:<id>` sentinel (a
 * real id, picked by hand rather than written in script) can't be spelled as
 * script text — noted inline as a comment instead of silently dropped, so the
 * model knows that field exists and is already set to something specific.
 */
export function serializeActionScript(label: string, steps: ActionStep[]): string {
  const idToPosition = new Map(steps.map((step, i) => [step.id, i + 1]));
  const lines: string[] = [];
  if (label) lines.push(`LABEL ${quote(label)}`);

  for (const step of steps) {
    const job = actionJobRegistry.get(step.jobId);
    if (!job) continue;
    const parts = [step.jobId];
    const notes: string[] = [];

    for (const field of job.fields) {
      const value = step.jobParams[field.key];
      if (value === undefined || value === "") continue;

      if (field.kind === "cardPicker" || field.kind === "vaultCardPicker") {
        const str = String(value);
        if (str.startsWith("step:")) {
          const pos = idToPosition.get(str.slice("step:".length));
          if (pos) parts.push(`${field.key}=step:${pos}`);
        } else {
          const title = step.jobParams[`${field.key}Title`];
          notes.push(`${field.key} is fixed to an existing card${title ? ` ("${title}")` : ""}, not writable here`);
        }
      } else if (field.kind === "pagePicker") {
        const title = step.jobParams[`${field.key}Title`];
        if (title) parts.push(`${field.key}=${quote(String(title))}`);
      } else if (field.kind === "templatePicker") {
        continue;
      } else {
        parts.push(`${field.key}=${quote(String(value))}`);
      }
    }

    lines.push(parts.join(" "));
    for (const note of notes) lines.push(`# ${note}`);
  }

  return lines.join("\n");
}
