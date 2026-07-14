"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Citation } from "@/lib/api";
import { buildGraphModel, type GraphNode } from "@/lib/graph";
import {
  displaySymbol,
  formatScore,
  rangeLabel,
  signatureLine,
} from "@/lib/format";

type EdgeGeom = {
  upper: number;
  lower: number;
  d: string;
  mx: number;
  my: number;
};

export function GraphView(props: {
  citations: Citation[];
  selectedIndex: number | null;
  /** select the citation AND switch the pane to Code */
  onOpen: (index: number) => void;
}) {
  const { citations, selectedIndex, onOpen } = props;
  const model = useMemo(
    () => buildGraphModel(citations, selectedIndex ?? undefined),
    [citations, selectedIndex],
  );

  const stackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [edges, setEdges] = useState<EdgeGeom[]>([]);
  // the ONE measurement: overlay size = card-stack scroll size (content-driven,
  // stable — the SVG is absolute/pointer-events-none so it can't feed back).
  const [svgDims, setSvgDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);

  const setCardRef = useCallback((index: number, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(index, el);
    else cardRefs.current.delete(index);
  }, []);

  const measure = useCallback(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const w = stack.scrollWidth;
    const h = stack.scrollHeight;
    if (!Number.isFinite(w) || w === 0 || h === 0) return; // pre-layout — skip
    setSvgDims({ w, h });

    // edge coords from card offsets relative to the stack (their offsetParent)
    const next: EdgeGeom[] = [];
    for (const e of model.edges) {
      const u = cardRefs.current.get(e.upper);
      const l = cardRefs.current.get(e.lower);
      if (!u || !l) continue;
      if (u.offsetWidth === 0 || l.offsetWidth === 0) continue;
      const sx = u.offsetLeft + u.offsetWidth / 2;
      const sy = u.offsetTop + u.offsetHeight + 3;
      const ex = l.offsetLeft + l.offsetWidth / 2;
      const ey = l.offsetTop - 5;
      if (![sx, sy, ex, ey].every(Number.isFinite)) continue;
      const dy = ey - sy;
      const c = Math.max(46, Math.abs(dy) * 0.42);
      const d = `M ${sx} ${sy} C ${sx} ${sy + c}, ${ex} ${ey - c}, ${ex} ${ey}`;
      next.push({ upper: e.upper, lower: e.lower, d, mx: (sx + ex) / 2, my: (sy + ey) / 2 });
    }
    setEdges(next);
  }, [model]);

  useLayoutEffect(() => {
    measure();
    const raf = requestAnimationFrame(measure);
    let ro: ResizeObserver | undefined;
    if (stackRef.current && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measure());
      ro.observe(stackRef.current);
    }
    window.addEventListener("resize", measure);
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // open centered on the selected node when it's laid out here, else the focal
  // seed; re-center whenever the selection or the answer changes
  const centerIndex =
    selectedIndex !== null && model.nodesByIndex.has(selectedIndex)
      ? selectedIndex
      : model.focalIndex;
  useEffect(() => {
    if (centerIndex === null || centerIndex < 0) return;
    const center = () =>
      cardRefs.current.get(centerIndex)?.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "auto",
      });
    center();
    const raf = requestAnimationFrame(center);
    return () => cancelAnimationFrame(raf);
  }, [citations, centerIndex]);

  if (citations.length === 0 || model.focal === null) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8">
        <p className="max-w-[40ch] text-center text-[13px] leading-relaxed text-mute">
          The call hierarchy behind an answer appears here — callers above the seed
          symbol, callees below.
        </p>
      </div>
    );
  }

  // hover takes precedence over the persistent selection for focus highlighting
  const focus = hover ?? selectedIndex;
  const connected = new Set<number>();
  if (focus !== null) {
    connected.add(focus);
    for (const e of model.edges) {
      if (e.upper === focus) connected.add(e.lower);
      if (e.lower === focus) connected.add(e.upper);
    }
  }

  const nodeCount = model.nodesByIndex.size;
  const renderNode = (n: GraphNode) => (
    <NodeCard
      key={n.index}
      node={n}
      setRef={setCardRef}
      selected={selectedIndex === n.index}
      dim={focus !== null && !connected.has(n.index)}
      onOpen={() => onOpen(n.index)}
      onHover={setHover}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* height-constrained frame; the graph renders at natural size and scrolls */}
      <div
        className="relative m-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-line"
        style={{
          backgroundColor: "#0C1324",
          backgroundImage:
            "radial-gradient(900px 520px at 50% 42%, rgba(92,168,248,0.06), transparent 62%), radial-gradient(rgba(199,211,230,0.055) 1px, transparent 1px)",
          backgroundSize: "auto, 23px 23px",
          backgroundPosition: "center, center",
        }}
      >
        {/* single scroll box; margin:auto centering is scroll-safe (both axes) */}
        <div className="scroll-slim absolute inset-0 flex overflow-auto">
          {/* content wrapper at natural width — shrink-0 so flex can't squeeze it
              into wrapping; overflows into scroll instead */}
          <div className="relative m-auto w-max shrink-0">
            <svg
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={svgDims.w || undefined}
              height={svgDims.h || undefined}
              aria-hidden="true"
            >
              <defs>
                <marker id="arrowAzure" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
                  <path d="M0.5,0.5 L9.5,5 L0.5,9.5 L3,5 Z" fill="#5CA8F8" />
                </marker>
                <marker id="arrowCyan" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
                  <path d="M0.5,0.5 L9.5,5 L0.5,9.5 L3,5 Z" fill="#5EEAD4" />
                </marker>
              </defs>
              {edges.map((e, i) => {
                const hot = focus !== null && (e.upper === focus || e.lower === focus);
                const dim = focus !== null && !hot;
                return (
                  <g
                    key={i}
                    className={`graph-edge-group ${hot ? "hot" : ""} ${dim ? "dim" : ""}`}
                  >
                    <path
                      className={`graph-edge ${hot ? "hot" : ""} ${dim ? "dim" : ""}`}
                      d={e.d}
                      markerEnd={hot ? "url(#arrowCyan)" : "url(#arrowAzure)"}
                    />
                    <rect className="edge-label-bg" x={e.mx - 20} y={e.my - 8.5} width={40} height={17} rx={5} />
                    <text className="edge-label" x={e.mx} y={e.my + 0.5}>
                      calls
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* tiers in normal flow — the ONLY thing that sizes the content */}
            <div
              ref={stackRef}
              className="relative z-10 flex flex-col items-center gap-8 px-8 py-8"
            >
              <Tier
                label="Callers"
                nodes={model.callers}
                overflow={model.callerOverflow}
                renderNode={renderNode}
              />

              <div className="flex flex-col items-center gap-2">
                {renderNode(model.focal)}
                {model.otherCount > 0 && (
                  <span className="rounded-full border border-line bg-panel2/70 px-3 py-1 font-mono text-[11px] text-mute">
                    +{model.otherCount} other vector match
                    {model.otherCount === 1 ? "" : "es"} · see Sources
                  </span>
                )}
              </div>

              <Tier
                label="Callees"
                nodes={model.callees}
                overflow={model.calleeOverflow}
                renderNode={renderNode}
              />
            </div>
          </div>
        </div>

        <Legend />
      </div>

      <div className="flex flex-none items-center gap-3 border-t border-linesoft bg-panel2 px-3.5 py-2.5 font-mono text-[11px] text-mute">
        <span>Click a node to open its code · scroll to explore</span>
        <span className="ml-auto">
          {nodeCount} node{nodeCount === 1 ? "" : "s"} · {model.edges.length} call
          {model.edges.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function Tier(props: {
  label: string;
  nodes: GraphNode[];
  overflow: number;
  renderNode: (n: GraphNode) => React.ReactNode;
}) {
  const { label, nodes, overflow, renderNode } = props;
  if (nodes.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-center font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-mute">
        {label}
      </div>
      <div className="flex flex-nowrap items-stretch justify-center gap-3">
        {nodes.map((n) => renderNode(n))}
        {overflow > 0 && (
          <div className="flex w-[120px] items-center justify-center self-center rounded-xl border border-dashed border-line bg-panel2/50 px-3 py-3 text-center font-mono text-[12px] text-mute">
            +{overflow} more
          </div>
        )}
      </div>
    </div>
  );
}

const RELATION: Record<GraphNode["kind"], { glyph: string; text: string }> = {
  seed: { glyph: "◆", text: "cited source" },
  caller: { glyph: "↘", text: "calls the seed" },
  callee: { glyph: "↙", text: "called by the seed" },
  related: { glyph: "↙", text: "related via call-graph" },
};

function NodeCard(props: {
  node: GraphNode;
  selected: boolean;
  dim: boolean;
  setRef: (index: number, el: HTMLElement | null) => void;
  onOpen: () => void;
  onHover: (index: number | null) => void;
}) {
  const { node, selected, dim, setRef, onOpen, onHover } = props;
  const c = node.citation;
  const isSeed = node.kind === "seed";
  const score = Math.max(0, Math.min(1, c.score));
  const scoreLabel = formatScore(c.score);
  const rel = RELATION[node.kind];

  const badge =
    node.kind === "seed"
      ? "border border-cyan/45 bg-cyan/[0.14] text-cyan"
      : node.kind === "caller"
        ? "border border-azure/40 bg-azure/[0.15] text-azure"
        : "border border-azure/45 bg-transparent text-azure";

  return (
    <article
      ref={(el) => setRef(node.index, el)}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${node.kind}, node ${node.number}, ${displaySymbol(c)} at ${c.file} lines ${c.start_line} to ${c.end_line}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => onHover(node.index)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(node.index)}
      onBlur={() => onHover(null)}
      style={{ width: isSeed ? 288 : 236 }}
      className={[
        "flex-none cursor-pointer rounded-xl border p-2.5 text-left shadow-[0_12px_28px_-16px_rgba(0,0,0,0.75)] transition",
        "hover:-translate-y-0.5 hover:border-[#31456B]",
        isSeed
          ? "border-cyan/50 bg-gradient-to-b from-[#12233A] to-[#0D1A2E] shadow-[0_0_0_1px_rgba(94,234,212,0.1),0_0_34px_-6px_rgba(94,234,212,0.35),0_18px_40px_-20px_rgba(0,0,0,0.85)]"
          : "border-line bg-gradient-to-b from-[#121D34] to-[#0E1729]",
        selected ? "!border-cyan shadow-[0_0_0_1px_rgba(94,234,212,0.35),0_0_40px_-6px_rgba(94,234,212,0.4)]" : "",
        dim ? "opacity-[0.34] saturate-[0.7]" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={`grid h-4 w-4 flex-none place-items-center rounded-[4px] border font-mono text-[10px] font-semibold ${
              isSeed ? "border-cyan/40 text-cyan" : "border-line text-mute"
            }`}
          >
            {node.number}
          </span>
          <span
            className={`rounded-[5px] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] ${badge}`}
          >
            {node.kind}
          </span>
        </div>
        <div className="flex flex-none items-center gap-2">
          <span className="h-[5px] w-[38px] overflow-hidden rounded-sm bg-line">
            <span
              className={`block h-full rounded-sm ${isSeed ? "bg-cyan" : "bg-azure"}`}
              style={{ width: `${Math.round(score * 100)}%` }}
            />
          </span>
          <span
            className={`w-[28px] text-right font-mono text-[11.5px] font-semibold ${
              scoreLabel ? (isSeed ? "text-cyan" : "text-ink") : "text-mute"
            }`}
          >
            {scoreLabel ?? "·"}
          </span>
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-mute">
        <span className={`font-mono ${isSeed ? "text-cyan" : "text-azure"}`}>
          {rel.glyph}
        </span>
        {rel.text}
      </div>

      <div
        className={`mt-0.5 truncate font-mono font-semibold ${isSeed ? "text-[15px] text-[#F4FBF8]" : "text-[14px] text-inkbright"}`}
      >
        {displaySymbol(c)}
      </div>
      <div className="mt-0.5 truncate font-mono text-[10.5px] text-mute">
        {c.file}
        <span className={isSeed ? "text-cyan" : "text-azure"}>:{rangeLabel(c)}</span>
      </div>

      <code className="mt-2 block overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-white/[0.045] bg-white/[0.028] px-2 py-1.5 font-mono text-[11px] leading-snug text-[#9FB0CB]">
        {signatureLine(c.snippet) || "—"}
      </code>
    </article>
  );
}

function Legend() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-3 left-3 z-[4] rounded-[10px] border border-line bg-[rgba(13,20,36,0.86)] px-3 py-2.5 backdrop-blur-sm"
    >
      <div className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-mute">
        Legend
      </div>
      <LegendRow>
        <span className="h-2.5 w-2.5 flex-none rounded-[3px] bg-cyan shadow-[0_0_8px_rgba(94,234,212,0.6)]" />
        Seed symbol
      </LegendRow>
      <LegendRow>
        <span className="h-2.5 w-2.5 flex-none rounded-[3px] border-[1.5px] border-azure" />
        Caller / callee
      </LegendRow>
      <LegendRow>
        <span className="w-2.5 flex-none text-center font-mono font-semibold text-azure">
          ↓
        </span>
        calls direction
      </LegendRow>
    </div>
  );
}

function LegendRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-[2px] text-[11px] text-ink">
      {children}
    </div>
  );
}
