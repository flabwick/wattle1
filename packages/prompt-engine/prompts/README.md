# Prompts

Every prompt the generation pipeline sends to a model lives here as a plain markdown
file, loaded fresh off disk by `src/promptCompiler.ts` at the moment it's used — editing
one of these files changes model behavior on the very next generation, with no rebuild or
restart.

One subfolder per trigger mode (`PromptMode` in `src/promptCompiler.ts`):

| File | Loaded by | Used for |
| --- | --- | --- |
| `generate/system.md` | `compilePrompt({ mode: "generate", ... })` | The default per-Card generation triggered by the Dock's Generate action. |
| `selection/system.md` | `compilePrompt({ mode: "selection", ... })` | A sub-generation scoped to a highlighted/selected span of text inside a Card. Compiler support only for now — no UI trigger wired up yet. |
| `interactive/system.md` | `compilePrompt({ mode: "interactive", ... })` | A generation whose trigger Card's own content supplies an override instruction instead of being ordinary surrounding context. Compiler support only for now — no UI trigger wired up yet. |

All three share the same output contract: the response is exactly one root
`<card type="..." title="...">...</card>` block, which may contain any number of nested
`<card>...</card>` blocks at any depth for sub-points. See
`src/parsers/cardBlockParser.ts` for the stream parser that consumes this format.

## Adding a new prompt (generation modes)

1. Create `<mode>/system.md` here.
2. Add the mode to `PromptMode` and `SYSTEM_PROMPT_FILE` in `src/promptCompiler.ts`.

## Annotation processes (a separate, parallel system)

| File | Loaded by | Used for |
| --- | --- | --- |
| `diff/system.md` | `compileAnnotationPrompt({ process: "diff", ... })` | Proposing text replacements (spelling/grammar) on existing Card content. |
| `footnote/system.md` | `compileAnnotationPrompt({ process: "footnote", ... })` | Attaching plain-text clarifying notes to existing Card content. |
| `highlight/system.md` | `compileAnnotationPrompt({ process: "highlight", ... })` | Marking notable spans of existing Card content, with an optional note. |

These do not use the `<card>` block contract above — they never re-emit or rewrite Card
content, only a JSON array of sparse `{cardId, anchor, ...}` entries anchored to an exact
substring of the target content (dropped silently if the anchor doesn't match). See
`src/annotationCompiler.ts` and `src/annotationParser.ts`.
