import type { Citation } from "./api";

/** "utils.py" from "app/dependencies/utils.py" */
export function fileBase(file: string): string {
  return file.split("/").pop() ?? file;
}

/** ":598–657" or ":746" when single-line */
export function rangeLabel(c: Citation): string {
  return c.end_line !== c.start_line
    ? `${c.start_line}–${c.end_line}`
    : `${c.start_line}`;
}

/** A readable symbol for a citation — its symbol, else the file basename. */
export function displaySymbol(c: Citation): string {
  return c.symbol?.trim() || fileBase(c.file);
}

/** First non-blank line of the snippet — used as a one-line signature. */
export function signatureLine(snippet: string): string {
  const line = snippet
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? "";
}

/** Human label for a citation's role in retrieval. */
export function kindLabel(c: Citation): string {
  if (c.source === "seed") return "Seed";
  if (c.edge === "caller") return "Caller";
  if (c.edge === "callee") return "Callee";
  return "Related";
}

/**
 * A 2-decimal score, or null when it's effectively zero. Reranked relevance for
 * low-ranked chunks is ~0, so "0.00" reads as broken — hide the number, keep the
 * bar, and let callers render nothing / a dot instead.
 */
export function formatScore(score: number): string | null {
  return score >= 0.01 ? score.toFixed(2) : null;
}
