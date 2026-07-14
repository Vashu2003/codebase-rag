import type { Citation } from "./api";

export type GraphKind = "seed" | "caller" | "callee" | "related";

export type GraphNode = {
  /** index into the turn's citations array (0-based) */
  index: number;
  /** 1-based citation number shown in the UI */
  number: number;
  kind: GraphKind;
  citation: Citation;
};

export type GraphEdge = {
  /** citation index of the upper (calling) node */
  upper: number;
  /** citation index of the lower (called) node — arrowhead lands here */
  lower: number;
};

export type GraphModel = {
  focalIndex: number | null;
  focal: GraphNode | null;
  callers: GraphNode[]; // capped, strongest first
  callees: GraphNode[]; // capped, strongest first
  callerOverflow: number; // callers beyond the cap
  calleeOverflow: number; // callees beyond the cap
  /** non-focal, non-caller, non-callee citations (extra seed matches etc.) */
  otherCount: number;
  edges: GraphEdge[];
  nodesByIndex: Map<number, GraphNode>;
};

/** Max cards per tier before we collapse the rest into a "+N more" node. */
export const TIER_CAP = 4;

/**
 * Derive a *curated* call hierarchy from a turn's citations, focused on ONE
 * focal seed — not every citation (real answers cite ~19, which is a hairball).
 *
 *  - focal SEED = `preferredFocal` when it's a seed, else the highest-scored
 *    `source:"seed"` citation, else the highest-scored citation overall.
 *  - callers = `edge:"caller"` (top {@link TIER_CAP} by score), rendered ABOVE.
 *  - callees = `edge:"callee"` (top {@link TIER_CAP} by score), rendered BELOW.
 *  - everything else (extra seed vector matches, edge-less graph neighbors) is
 *    NOT laid out — it's counted in `otherCount` and stays in the Sources list.
 *
 * Every edge is drawn upper.bottom → lower.top with the arrowhead at `lower`.
 */
export function buildGraphModel(
  citations: Citation[],
  preferredFocal?: number,
): GraphModel {
  const empty: GraphModel = {
    focalIndex: null,
    focal: null,
    callers: [],
    callees: [],
    callerOverflow: 0,
    calleeOverflow: 0,
    otherCount: 0,
    edges: [],
    nodesByIndex: new Map(),
  };
  if (citations.length === 0) return empty;

  const node = (index: number, kind: GraphKind): GraphNode => ({
    index,
    number: index + 1,
    kind,
    citation: citations[index],
  });

  // pick the focal seed
  let focalIndex = -1;
  if (
    preferredFocal !== undefined &&
    citations[preferredFocal]?.source === "seed"
  ) {
    focalIndex = preferredFocal;
  }
  if (focalIndex < 0) {
    let best = -Infinity;
    citations.forEach((c, i) => {
      if (c.source === "seed" && c.score > best) {
        best = c.score;
        focalIndex = i;
      }
    });
  }
  if (focalIndex < 0) {
    let best = -Infinity;
    citations.forEach((c, i) => {
      if (c.score > best) {
        best = c.score;
        focalIndex = i;
      }
    });
  }

  const focal = node(focalIndex, "seed");

  const allCallers: GraphNode[] = [];
  const allCallees: GraphNode[] = [];
  let otherCount = 0;
  citations.forEach((c, i) => {
    if (i === focalIndex) return;
    if (c.edge === "caller") allCallers.push(node(i, "caller"));
    else if (c.edge === "callee") allCallees.push(node(i, "callee"));
    else otherCount++;
  });

  const byScore = (a: GraphNode, b: GraphNode) =>
    b.citation.score - a.citation.score;
  allCallers.sort(byScore);
  allCallees.sort(byScore);

  // Always keep the explicitly-selected caller/callee rendered, even past the
  // cap, so a selection made from the Sources list or a [n] chip is never
  // dropped from the Graph tab (otherwise the selected node is invisible here
  // while the Code tab shows it fine).
  const keepSelected = (capped: GraphNode[], all: GraphNode[]): GraphNode[] => {
    if (
      preferredFocal === undefined ||
      preferredFocal === focalIndex ||
      capped.some((n) => n.index === preferredFocal)
    )
      return capped;
    const sel = all.find((n) => n.index === preferredFocal);
    return sel ? [...capped, sel] : capped;
  };
  const callers = keepSelected(allCallers.slice(0, TIER_CAP), allCallers);
  const callees = keepSelected(allCallees.slice(0, TIER_CAP), allCallees);
  const callerOverflow = allCallers.length - callers.length;
  const calleeOverflow = allCallees.length - callees.length;

  const edges: GraphEdge[] = [
    ...callers.map((n) => ({ upper: n.index, lower: focalIndex })),
    ...callees.map((n) => ({ upper: focalIndex, lower: n.index })),
  ];

  const nodesByIndex = new Map<number, GraphNode>();
  for (const n of [focal, ...callers, ...callees]) nodesByIndex.set(n.index, n);

  return {
    focalIndex,
    focal,
    callers,
    callees,
    callerOverflow,
    calleeOverflow,
    otherCount,
    edges,
    nodesByIndex,
  };
}
