from pydantic import BaseModel


class IngestRequest(BaseModel):
    path: str          # absolute path to a local repo checkout
    repo: str          # logical name used to namespace the collection


class Citation(BaseModel):
    repo: str
    file: str
    start_line: int
    end_line: int
    symbol: str | None = None
    score: float


class QueryRequest(BaseModel):
    repo: str
    question: str
    top_k: int | None = None


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]


class IngestResponse(BaseModel):
    repo: str
    files_indexed: int
    chunks_indexed: int
