from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    # exactly one of path/url; repo names the collection (derived from url if omitted)
    path: str | None = Field(default=None, min_length=1)   # local repo checkout path
    url: str | None = Field(default=None, min_length=1, max_length=512)  # https git URL
    repo: str | None = Field(default=None, max_length=200)


class Citation(BaseModel):
    repo: str
    file: str
    start_line: int
    end_line: int
    symbol: str | None = None
    # 0-1 relevance: cross-encoder rerank score when reranking is on,
    # else clamped cosine similarity. See RetrievalStats.reranked.
    score: float
    source: str = "seed"        # 'seed' (vector hit) or 'graph' (expanded)
    edge: str | None = None     # for graph neighbors: 'caller' or 'callee'


class QueryRequest(BaseModel):
    repo: str = Field(min_length=1, max_length=200)
    question: str = Field(min_length=1, max_length=4000)
    # sizes the vector-seed pull; the number of chunks actually returned is
    # governed by the token budget after graph expansion + dedup, not by this.
    top_k: int | None = Field(default=None, ge=1, le=100)


class RetrievalStats(BaseModel):
    seeds: int              # vector hits before expansion
    graph_neighbors: int    # chunks pulled via the code graph
    after_dedup: int        # candidates left after semantic dedup (pre-budget)
    sent: int               # chunks actually placed in the prompt (post-budget)
    est_tokens: int         # estimated context tokens (chunk bodies + framing)
    graph_used: bool        # did a graph neighbor survive into the context
    reranked: bool          # was the candidate pool cross-encoder reranked


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    retrieval: RetrievalStats | None = None


class IngestResponse(BaseModel):
    repo: str
    files_indexed: int
    chunks_indexed: int
