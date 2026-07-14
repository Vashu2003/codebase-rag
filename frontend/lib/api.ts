const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Citation = {
  repo: string;
  file: string;
  start_line: number;
  end_line: number;
  symbol: string | null;
  score: number;
  source: "seed" | "graph";
  edge: "caller" | "callee" | null;
  /** the actual retrieved code — powers the Code tab and graph-card signatures */
  snippet: string;
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

/** An already-indexed repo, for the switcher. */
export type Repo = {
  repo: string;
  files: number;
  chunks: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    // network-level failure (backend down, CORS, DNS) — fetch rejects with no body
    throw new Error(
      `Can't reach the backend at ${BASE}. Is it running? (uvicorn app.main:app)`,
    );
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    const detail = payload?.detail;
    // FastAPI sends a string detail for HTTPException, but an array of error
    // objects for 422 validation errors — stringify the latter so it's readable.
    const message =
      typeof detail === "string"
        ? detail
        : detail
          ? JSON.stringify(detail)
          : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Indexed repos for the switcher. Returns [] when none / graph disabled. */
export function listRepos(): Promise<Repo[]> {
  return request<Repo[]>("/repos");
}

/**
 * Index a repository. `source` is a GitHub URL (cloned server-side) or a local
 * path. For a URL the repo name is optional — the backend derives it.
 */
export function ingest(source: string, repo?: string): Promise<IngestResponse> {
  const body = /^https?:\/\//.test(source)
    ? { url: source, repo: repo || undefined }
    : { path: source, repo };
  return post<IngestResponse>("/ingest", body);
}

export function query(
  repo: string,
  question: string,
  topK?: number,
): Promise<QueryResponse> {
  return post<QueryResponse>("/query", { repo, question, top_k: topK });
}
