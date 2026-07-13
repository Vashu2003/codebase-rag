from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    path: str = Field(min_length=1)          # local repo checkout path
    repo: str = Field(min_length=1, max_length=200)  # namespaces the collection


class Citation(BaseModel):
    repo: str
    file: str
    start_line: int
    end_line: int
    symbol: str | None = None
    score: float


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


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    retrieval: RetrievalStats | None = None


class IngestResponse(BaseModel):
    repo: str
    files_indexed: int
    chunks_indexed: int
