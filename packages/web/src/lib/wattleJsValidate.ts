/**
 * Whether `source` is at least syntactically valid JavaScript on its own —
 * checked by constructing (never invoking) the exact same wrapper
 * wattleSandboxBootstrap.ts's own `runMain()` uses to run it, so anything
 * that fails here is guaranteed to fail there too, byte for byte. `new
 * Function(...)` only parses when constructed like this; nothing runs.
 *
 * Wired into every point that can write to a "js" Card's own
 * `metadata.js.source` — the editor's own textarea Generate result, the info
 * panel's Apply and its own Generate, and the agent's setJsCard job — so a
 * script that doesn't parse (a model response that wasn't actually code, a
 * stray fence, truncated output, an HTML error page mistaken for the model's
 * response) gets caught and reported right where it was about to be saved,
 * instead of silently landing in the Card and only surfacing later as a
 * cryptic, unattributed failure inside the live sandbox.
 */
export function validateWattleJsSource(source: string): string | null {
  try {
    // eslint-disable-next-line no-new-func -- constructing only, never
    // invoking, the returned function — this never runs the given code.
    new Function("wattle", "return (async () => {\n" + source + "\n})()");
    return null;
  } catch (err) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }
}
