import { useCallback, useEffect, useRef, useState } from "react";

interface StreamChunk {
  text: string;
  done: boolean;
}

interface UseGenerationResult {
  /** Accumulated text streamed so far for the in-progress (or most recent) run. */
  text: string;
  isStreaming: boolean;
  error: string | null;
  /**
   * Opens the SSE stream for a PageCard and resolves once the final chunk arrives.
   * Resets `text` to "" at the start of each call.
   */
  start: (pageCardId: string) => Promise<void>;
}

/**
 * Consumes the Step 2 streaming endpoint (GET /api/generate/stream/:pageCardId) via
 * EventSource — a plain GET returning `data: {...}\n\n` events matches EventSource's
 * default "message" event exactly, so no manual fetch-stream parsing is needed here
 * (unlike api/client.ts's fetch-based `request()`, which is for the JSON request/
 * response endpoints).
 *
 * That endpoint is read-only (see docs/step2-model-providers.md) — it never persists a
 * Card. So `start` only gives a live preview of the generated text; the caller is still
 * responsible for triggering the actual persisting call (the existing, non-streaming
 * POST /api/generate) once `start` resolves, exactly as before this hook existed.
 */
export function useGeneration(): UseGenerationResult {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => () => sourceRef.current?.close(), []);

  const start = useCallback((pageCardId: string) => {
    sourceRef.current?.close();
    setText("");
    setError(null);
    setIsStreaming(true);

    return new Promise<void>((resolve, reject) => {
      const source = new EventSource(`/api/generate/stream/${pageCardId}`);
      sourceRef.current = source;

      source.onmessage = (event) => {
        let chunk: StreamChunk;
        try {
          chunk = JSON.parse(event.data) as StreamChunk;
        } catch {
          source.close();
          setIsStreaming(false);
          const message = "Failed to parse stream chunk";
          setError(message);
          reject(new Error(message));
          return;
        }

        setText((prev) => prev + chunk.text);
        if (chunk.done) {
          source.close();
          setIsStreaming(false);
          resolve();
        }
      };

      source.onerror = () => {
        source.close();
        setIsStreaming(false);
        const message = "Streaming connection failed";
        setError(message);
        reject(new Error(message));
      };
    });
  }, []);

  return { text, isStreaming, error, start };
}
