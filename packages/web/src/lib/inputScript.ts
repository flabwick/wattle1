import type { CardMetadataV1 } from "@wattle/shared";

/**
 * A small, line-oriented text format an LLM can write for an "input" Card's own
 * `content` — the "input" counterpart to actionScript.ts's action-script language
 * (see that file's own doc comment; this mirrors its structure closely, just for a
 * different, much smaller vocabulary, so the two stay independent rather than
 * sharing a coupled parser). One directive per line, case-insensitive keyword:
 *
 *   KIND radio
 *   OPTION "Option A"
 *   OPTION "Option B"
 *   DEFAULT "Option A"
 *
 * - `KIND <kind>` (required, exactly once) — one of the `InputKind` values below.
 * - `OPTION "label"` (one per line) — only valid when `kind` is one of
 *   radio/dropdown/multiSelect/combobox.
 * - `DEFAULT "value" ["value2" ...]` (optional, at most once) — the pre-selected
 *   value(s). More than one token is only valid for `multiSelect`; for an
 *   option-based kind, every token must match an earlier `OPTION`'s own label; for
 *   `checkbox` the single token must be `"true"` or `"false"`.
 * - `PLACEHOLDER "..."` (optional) — only valid when `kind` is one of
 *   text/textarea/number/combobox.
 *
 * Blank lines and lines starting with `#` are ignored. Never throws: syntax and
 * validation problems collect into `errors` (one entry per offending line) so a
 * caller can show them instead of the whole generation being an all-or-nothing
 * failure — same contract `parseActionScript` already follows.
 */

export type InputKind = NonNullable<CardMetadataV1["input"]>["kind"];

const VALID_KINDS: InputKind[] = [
  "text",
  "textarea",
  "number",
  "checkbox",
  "radio",
  "dropdown",
  "multiSelect",
  "combobox",
];
const OPTION_KINDS = new Set<InputKind>(["radio", "dropdown", "multiSelect", "combobox"]);
const PLACEHOLDER_KINDS = new Set<InputKind>(["text", "textarea", "number", "combobox"]);

export interface InputScriptResult {
  kind: InputKind | null;
  options: { value: string; label: string }[];
  placeholder: string | undefined;
  value: string[];
  errors: string[];
}

/** Same quote-aware tokenizer/unquote pair actionScript.ts already has — small
 *  enough to duplicate rather than couple these two unrelated mini-languages
 *  together through a shared module. */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const re = /"(?:\\.|[^"\\])*"|\S+/g;
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

export function parseInputScript(text: string): InputScriptResult {
  const lines = text.split("\n");
  const errors: string[] = [];
  let kind: InputKind | null = null;
  const options: { value: string; label: string }[] = [];
  let placeholder: string | undefined;
  let defaultTokens: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    if (/^KIND\b/i.test(line)) {
      const raw = unquote(line.replace(/^KIND\s*/i, ""));
      if (!(VALID_KINDS as string[]).includes(raw)) {
        errors.push(`Line ${lineNo}: "KIND" must be one of ${VALID_KINDS.join("|")} — got "${raw}"`);
        continue;
      }
      if (kind !== null) {
        errors.push(`Line ${lineNo}: "KIND" can only be set once`);
        continue;
      }
      kind = raw as InputKind;
      continue;
    }

    if (/^OPTION\b/i.test(line)) {
      const label = unquote(line.replace(/^OPTION\s*/i, ""));
      if (!label) {
        errors.push(`Line ${lineNo}: "OPTION" needs a quoted label`);
        continue;
      }
      options.push({ value: label, label });
      continue;
    }

    if (/^DEFAULT\b/i.test(line)) {
      const tokens = tokenize(line).slice(1).map(unquote);
      if (tokens.length === 0) {
        errors.push(`Line ${lineNo}: "DEFAULT" needs at least one quoted value`);
        continue;
      }
      if (defaultTokens !== null) {
        errors.push(`Line ${lineNo}: "DEFAULT" can only be set once (list every value on that one line)`);
        continue;
      }
      defaultTokens = tokens;
      continue;
    }

    if (/^PLACEHOLDER\b/i.test(line)) {
      placeholder = unquote(line.replace(/^PLACEHOLDER\s*/i, ""));
      continue;
    }

    errors.push(`Line ${lineNo}: unrecognized line "${line}"`);
  }

  if (kind === null) {
    errors.push(`"KIND" is required, one of ${VALID_KINDS.join("|")}`);
    return { kind: null, options, placeholder, value: [], errors };
  }

  if (!OPTION_KINDS.has(kind) && options.length > 0) {
    errors.push(`"OPTION" isn't valid for kind "${kind}"`);
  }
  if (!PLACEHOLDER_KINDS.has(kind) && placeholder !== undefined) {
    errors.push(`"PLACEHOLDER" isn't valid for kind "${kind}"`);
  }

  let value: string[] = [];
  if (defaultTokens) {
    if (kind !== "multiSelect" && defaultTokens.length > 1) {
      errors.push(`"DEFAULT" accepts only one value for kind "${kind}"`);
    } else if (OPTION_KINDS.has(kind)) {
      const invalid = defaultTokens.filter((tok) => !options.some((o) => o.value === tok));
      if (invalid.length > 0) {
        errors.push(`"DEFAULT" value(s) ${invalid.map((v) => `"${v}"`).join(", ")} don't match any OPTION`);
      } else {
        value = kind === "multiSelect" ? defaultTokens : [defaultTokens[0]];
      }
    } else if (kind === "checkbox") {
      const tok = defaultTokens[0];
      if (tok !== "true" && tok !== "false") {
        errors.push(`"DEFAULT" for kind "checkbox" must be "true" or "false" — got "${tok}"`);
      } else if (tok === "true") {
        value = ["true"];
      }
    } else {
      value = [defaultTokens[0]];
    }
  }

  return { kind, options, placeholder, value, errors };
}
