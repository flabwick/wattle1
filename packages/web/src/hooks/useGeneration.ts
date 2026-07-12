import { useCallback, useEffect, useRef, useState } from "react";
import type { GeneratedCardPart } from "@wattle/shared";
import * as api from "../api/client.js";

/** One piece of a ghost card's content, in the order it streamed in: either literal
 *  text, or a reference to a nested ghost card (rendered as an embedded sub-card —
 *  see GhostCard.tsx). Mirrors @wattle/prompt-engine's CardBlockParser events, kept
 *  structurally duplicated here (not imported) since this is a browser bundle and
 *  that package is API/Node-only. */
export type GhostCardPart = { kind: "text"; text: string } | { kind: "child"; id: number };

export interface GhostCardNode {
  id: number;
  parentId: number | null;
  cardType: string;
  title: string;
  parts: GhostCardPart[];
  closed: boolean;
}

/** Where the in-flight/reviewing generation is anchored — a specific Card (insert
 *  directly below it) or a Page with nothing selected (append at the bottom). Mirrors
 *  @wattle/api's GenerationTarget. Tracked here so `accept()` knows which endpoint/
 *  payload shape to use without the caller having to remember and re-pass it. */
export type GenerationTarget =
  | { type: "card"; pageCardId: string }
  | { type: "page"; pageId: string };

interface CardBlockStreamEvent {
  type: "open" | "text" | "close" | "done" | "error";
  id?: number;
  parentId?: number | null;
  cardType?: string;
  title?: string;
  text?: string;
  message?: string;
}

interface UseGenerationResult {
  isStreaming: boolean;
  /** True once the stream has finished with a valid root ghost card and is awaiting
   *  the Dock's accept/deny review actions. */
  isReviewing: boolean;
  error: string | null;
  nodes: Record<number, GhostCardNode>;
  rootId: number | null;
  /** Where the current/last generation is anchored (see GenerationTarget) — null when
   *  nothing has been started yet. Lets callers (PageStack's ghost-card slot) know
   *  whether to render it after a specific PageCard or at the bottom of the Page. */
  target: GenerationTarget | null;
  /** Opens the SSE stream for a selected Card — the sole model call for this
   *  generation. Builds up the ghost card tree in local state only; nothing is
   *  persisted until `accept` is called. */
  start: (pageCardId: string) => void;
  /** Same as `start`, but for the "nothing selected" case — generates at the bottom
   *  of a Page instead of directly below a specific Card. */
  startForPage: (pageId: string) => void;
  /** Discards the ghost card from local state. No server call, no trace left. */
  deny: () => void;
  /** Persists the ghost card's root via POST /api/generate/accept. Any nested ghost
   *  cards are sent as structured parts (not flattened back into literal <card>
   *  markup) so the server can materialize each one as its own standalone Card and
   *  splice a `[[cardId]]` embed reference in its place — the server ends up doing the
   *  same thing CardLinkPicker.tsx does for a user-created embed, so an accepted
   *  generation's nested cards render and behave like any other embedded Card. */
  accept: () => Promise<void>;
}

/** Converts a ghost node's parts into the structured payload persistGeneratedCard(ToPage)
 *  expects, recursively — the exact text/nesting the model streamed, minus nothing. */
function buildParts(id: number, nodes: Record<number, GhostCardNode>): GeneratedCardPart[] {
  const node = nodes[id];
  if (!node) return [];
  return node.parts.map((part): GeneratedCardPart => {
    if (part.kind === "text") return { kind: "text", text: part.text };
    const child = nodes[part.id];
    return {
      kind: "child",
      cardType: child?.cardType ?? "note",
      title: child?.title ?? "",
      parts: child ? buildParts(child.id, nodes) : [],
    };
  });
}

/**
 * Consumes the streaming generation endpoints (GET /api/generate/stream/:pageCardId,
 * or /stream/page/:pageId for the "nothing selected" case) via EventSource. Those
 * endpoints are the sole model invocation for a generation — there is no separate
 * preview call and persist call any more — and they forward CardBlockParser events
 * instead of raw text chunks, so this hook builds up a small local tree (root ghost
 * card + any nested ghost cards) as those events arrive, rather than just
 * accumulating a string.
 */
export function useGeneration(): UseGenerationResult {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Record<number, GhostCardNode>>({});
  const [rootId, setRootId] = useState<number | null>(null);
  const [target, setTarget] = useState<GenerationTarget | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => () => sourceRef.current?.close(), []);

  const reset = useCallback(() => {
    setNodes({});
    setRootId(null);
    setIsReviewing(false);
    setError(null);
    setTarget(null);
  }, []);

  const openStream = useCallback(
    (streamTarget: GenerationTarget, url: string) => {
      sourceRef.current?.close();
      reset();
      setTarget(streamTarget);
      setIsStreaming(true);

      const source = new EventSource(url);
      sourceRef.current = source;

      source.onmessage = (evt) => {
        let event: CardBlockStreamEvent;
        try {
          event = JSON.parse(evt.data) as CardBlockStreamEvent;
        } catch {
          source.close();
          setIsStreaming(false);
          setError("Failed to parse stream event");
          return;
        }

        switch (event.type) {
          case "open": {
            const id = event.id!;
            const parentId = event.parentId ?? null;
            setNodes((prev) => {
              const node: GhostCardNode = {
                id,
                parentId,
                cardType: event.cardType ?? "note",
                title: event.title ?? "",
                parts: [],
                closed: false,
              };
              const next = { ...prev, [id]: node };
              if (parentId !== null && next[parentId]) {
                next[parentId] = {
                  ...next[parentId],
                  parts: [...next[parentId].parts, { kind: "child", id }],
                };
              }
              return next;
            });
            if (parentId === null) setRootId(id);
            break;
          }
          case "text": {
            const id = event.id!;
            const text = event.text ?? "";
            setNodes((prev) => {
              const node = prev[id];
              if (!node) return prev;
              const last = node.parts[node.parts.length - 1];
              const parts =
                last && last.kind === "text"
                  ? [...node.parts.slice(0, -1), { kind: "text" as const, text: last.text + text }]
                  : [...node.parts, { kind: "text" as const, text }];
              return { ...prev, [id]: { ...node, parts } };
            });
            break;
          }
          case "close": {
            const id = event.id!;
            setNodes((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], closed: true } } : prev));
            break;
          }
          case "done":
            source.close();
            setIsStreaming(false);
            setIsReviewing(true);
            break;
          case "error":
            source.close();
            setIsStreaming(false);
            setError(event.message ?? "Generation failed");
            break;
        }
      };

      source.onerror = () => {
        source.close();
        setIsStreaming(false);
        setError((prev) => prev ?? "Streaming connection failed");
      };
    },
    [reset],
  );

  const start = useCallback(
    (pageCardId: string) => openStream({ type: "card", pageCardId }, `/api/generate/stream/${pageCardId}`),
    [openStream],
  );

  const startForPage = useCallback(
    (pageId: string) => openStream({ type: "page", pageId }, `/api/generate/stream/page/${pageId}`),
    [openStream],
  );

  const deny = useCallback(() => {
    sourceRef.current?.close();
    reset();
  }, [reset]);

  const accept = useCallback(async () => {
    if (rootId === null || !target) return;
    const root = nodes[rootId];
    if (!root) return;
    const generated = {
      title: root.title,
      cardType: root.cardType,
      parts: buildParts(rootId, nodes),
    };
    await api.acceptGeneration(
      target.type === "card" ? { pageCardId: target.pageCardId } : { pageId: target.pageId },
      generated,
    );
    reset();
  }, [nodes, rootId, target, reset]);

  return { isStreaming, isReviewing, error, nodes, rootId, target, start, startForPage, deny, accept };
}
