import { useEffect, useRef, useState } from "react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";

/** Dynamically imported (mermaid pulls in every diagram-type sub-library and adds
 *  well over 500KB to the bundle) — most Cards never contain a mermaid fence, so
 *  this only loads the first time one actually renders, not on every page load. */
let mermaidModulePromise: ReturnType<typeof loadMermaid> | null = null;
async function loadMermaid() {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, theme: "neutral" });
  return mermaid;
}
function getMermaid() {
  if (!mermaidModulePromise) mermaidModulePromise = loadMermaid();
  return mermaidModulePromise;
}

/** codeBlockExtension's (@wattle/shared's CodeBlockLowlight) NodeView — a plain
 *  passthrough for every language (still a literal `<pre><code>`, so lowlight's own
 *  decoration plugin keeps highlighting it exactly as if there were no custom
 *  NodeView at all) except "mermaid", which additionally renders a live diagram
 *  preview below the raw source. The source stays the single source of truth — no
 *  separate node/attrs the way callout/math nodes need, since a code block's own
 *  text content already *is* the diagram definition. */
export function CodeBlockNodeView({ node }: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const isMermaid = language === "mermaid";
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-preview-${Math.random().toString(36).slice(2)}`);
  const source = node.textContent;

  useEffect(() => {
    if (!isMermaid) return;
    if (source.trim() === "") {
      setSvg(null);
      setError(null);
      return;
    }
    let cancelled = false;
    getMermaid()
      .then((mermaid) => mermaid.render(idRef.current, source))
      .then(({ svg: rendered }) => {
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [isMermaid, source]);

  return (
    <NodeViewWrapper className={isMermaid ? "code-block-node code-block-node--mermaid" : "code-block-node"}>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {isMermaid && svg && (
        <div className="code-block-node__mermaid-preview" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
      {isMermaid && error && <div className="code-block-node__mermaid-error">{error}</div>}
    </NodeViewWrapper>
  );
}
