import type { Citation, RetrievalStats } from "./api";

/** One question/answer exchange, with the retrieval behind it. */
export type Turn = {
  id: number;
  question: string;
  answer: string;
  citations: Citation[];
  retrieval: RetrievalStats | null;
};

/**
 * The shared "selected citation". Turn-scoped: the work pane reflects the turn
 * that owns the selection, so citations in older answers stay inspectable.
 */
export type Selection = { turn: number; cite: number };

export type RightTab = "code" | "graph";
