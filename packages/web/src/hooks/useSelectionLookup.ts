import { useEffect, useRef, useState } from "react";

interface SelectionLookupState {
  streaming: boolean;
  text: string;
  error: string | null;
}

/**
 * The text-selection quick-lookup row's own generation (Dock.tsx's showLookupRow) —
 * a sibling of usePromptGeneration.ts, same "accumulate `text` events into one HTML
 * string, don't build a GhostCardNode tree, never call POST /accept" shape, but
 * against `GET /api/generate/stream/lookup?text=&instruction=`
 * (generationService.ts's streamSelectionLookup) instead of a pageCardId-scoped
 * route — a lookup isn't tied to any Card at all until the user explicitly adds the
 * result to the Page or Dock (quickAddRegistry.ts), which happens client-side only,
 * no further model/server involvement.
 */
export function useSelectionLookup() {
  const [state, setState] = useState<SelectionLookupState>({ streaming: false, text: "", error: null });
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => () => sourceRef.current?.close(), []);

  function start(selectedText: string, instruction: string) {
    sourceRef.current?.close();
    setState({ streaming: true, text: "", error: null });

    const params = new URLSearchParams({ text: selectedText });
    if (instruction.trim()) params.set("instruction", instruction.trim());
    const url = `/api/generate/stream/lookup?${params.toString()}`;
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

  function reset() {
    sourceRef.current?.close();
    setState({ streaming: false, text: "", error: null });
  }

  return { ...state, start, stop, reset };
}
