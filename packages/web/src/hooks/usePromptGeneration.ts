import { useEffect, useRef, useState } from "react";

interface PromptGenerationState {
  streaming: boolean;
  text: string;
  error: string | null;
}

/**
 * A lean, prompt-Card-specific counterpart to useGeneration.ts — reuses the exact
 * same backend stream (`GET /api/generate/stream/:pageCardId?instruction=&standalone=1`,
 * generationService.ts's streamForTarget with `standalone: true`), but consumes it
 * directly instead of building a GhostCardNode tree: every `text` event (at any
 * nesting depth — a plain prompt completion isn't expected to contain nested
 * `<card>` blocks, and if the model emits one anyway its text still just flows into
 * the same accumulated string) is appended to one plain string, and `done`/`error`
 * just stop streaming. Deliberately never calls `POST /accept` — a Prompt Card's
 * whole point is keeping the output in *this* Card (PromptCardBody.tsx persists it
 * itself via cardStore.editCard), not creating a new sibling one the way every
 * other generation in the app does.
 */
export function usePromptGeneration() {
  const [state, setState] = useState<PromptGenerationState>({ streaming: false, text: "", error: null });
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => () => sourceRef.current?.close(), []);

  function start(pageCardId: string, input: string, onDone: (text: string) => void) {
    sourceRef.current?.close();
    setState({ streaming: true, text: "", error: null });

    const url = `/api/generate/stream/${pageCardId}?instruction=${encodeURIComponent(input)}&standalone=1`;
    const source = new EventSource(url);
    sourceRef.current = source;
    let accumulated = "";

    source.onmessage = (evt) => {
      let event: { type: string; text?: string; message?: string };
      try {
        event = JSON.parse(evt.data);
      } catch {
        source.close();
        setState((s) => ({ ...s, streaming: false, error: "Failed to parse stream event" }));
        return;
      }
      if (event.type === "text") {
        accumulated += event.text ?? "";
        setState((s) => ({ ...s, text: accumulated }));
      } else if (event.type === "done") {
        source.close();
        setState((s) => ({ ...s, streaming: false }));
        onDone(accumulated);
      } else if (event.type === "error") {
        source.close();
        setState((s) => ({ ...s, streaming: false, error: event.message ?? "Generation failed" }));
      }
    };

    source.onerror = () => {
      source.close();
      setState((s) => ({ ...s, streaming: false, error: s.error ?? "Streaming connection failed" }));
    };
  }

  function stop() {
    sourceRef.current?.close();
    setState((s) => ({ ...s, streaming: false }));
  }

  return { ...state, start, stop };
}
