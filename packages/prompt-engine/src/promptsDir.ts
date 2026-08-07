import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where every system prompt lives (`prompts/README.md`) — one folder, plain
 * markdown files, read fresh off disk on every call by each compiler (see
 * promptCompiler.ts/annotationCompiler.ts/summaryCompiler.ts/actionScriptCompiler.ts's
 * own `loadSystemPrompt`-shaped functions). Editing a `.md` file under `PROMPTS_DIR`
 * changes model behavior on the very next call — no rebuild, no restart.
 *
 * This file lives in `<package root>/src`; `prompts/` is a sibling of `src/` — one
 * level up from wherever this module actually runs from (`src/` in dev via tsx,
 * `dist/` if ever run compiled), so the relative offset holds either way. Was
 * duplicated verbatim across all four compiler files before being pulled out here —
 * if you're adding a fifth compiler, import `PROMPTS_DIR` from here rather than
 * re-deriving it again.
 */
export const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");
