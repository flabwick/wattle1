import "./PageStackEdges.css";

interface PageStackEdgesProps {
  above: number;
  below: number;
}

const MAX_VISIBLE_EDGES = 3;

interface BarSpec {
  width: string;
  opacity: number;
}

/** `n` bars, `rank` 1 = right at the content edge (full width/opacity) counting up
 *  the farther back in the stack a bar represents — `order` controls which end of
 *  the returned (DOM-order) array rank 1 lands on. */
function buildBars(n: number, order: "farthest-first" | "nearest-first"): BarSpec[] {
  return Array.from({ length: n }, (_, j) => {
    const rank = order === "farthest-first" ? n - j : j + 1;
    return { width: `${100 - (rank - 1) * 10}%`, opacity: 1 - (rank - 1) * 0.3 };
  });
}

/** Subtle sliver of the Pages stacked above/below the one currently in view — a few
 *  thin bars peeking in from the top/bottom edge of the scrollable Page region
 *  (App.tsx), narrower and fainter the further back in the stack they represent, so
 *  there's a constant at-a-glance sense of "how deep is this stack" without a number
 *  or any real layout height. Purely decorative (aria-hidden) — the PageNav dot row
 *  is the actual interactive/accessible way to see and jump between Pages. */
export function PageStackEdges({ above, below }: PageStackEdgesProps) {
  const aboveBars = buildBars(Math.min(above, MAX_VISIBLE_EDGES), "farthest-first");
  const belowBars = buildBars(Math.min(below, MAX_VISIBLE_EDGES), "nearest-first");

  return (
    <>
      {aboveBars.length > 0 && (
        <div className="page-stack-edges page-stack-edges--top" aria-hidden="true">
          {aboveBars.map((bar, i) => (
            <div key={i} className="page-stack-edges__bar" style={{ width: bar.width, opacity: bar.opacity }} />
          ))}
        </div>
      )}
      {belowBars.length > 0 && (
        <div className="page-stack-edges page-stack-edges--bottom" aria-hidden="true">
          {belowBars.map((bar, i) => (
            <div key={i} className="page-stack-edges__bar" style={{ width: bar.width, opacity: bar.opacity }} />
          ))}
        </div>
      )}
    </>
  );
}
