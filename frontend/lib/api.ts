const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Citation = {
  repo: string;
  file: string;
  start_line: number;
  end_line: number;
  symbol: string | null;
  score: number;
};

export type RetrievalStats = {
  seeds: number;
  graph_neighbors: number;
  after_dedup: number;
  sent: number;
  est_tokens: number;
  graph_used: boolean;
  reranked: boolean;
};

export type QueryResponse = {
  answer: string;
  citations: Citation[];
  retrieval: RetrievalStats | null;
};

export type IngestResponse = {
  repo: string;
  files_indexed: number;
  chunks_indexed: number;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    // FastAPI sends a string detail for HTTPException but an array of error
    // objects for 422 validation errors — stringify the latter so it's readable.
    const message =
      typeof detail === "string"
        ? detail
        : detail
          ? JSON.stringify(detail)
          : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}

export const ingest = (path: string, repo: string) =>
  post<IngestResponse>("/ingest", { path, repo });

export const query = (repo: string, question: string) =>
  post<QueryResponse>("/query", { repo, question });
