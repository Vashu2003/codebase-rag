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
    top_k: int | None = Field(default=None, ge=1, le=100)


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]


class IngestResponse(BaseModel):
    repo: str
    files_indexed: int
    chunks_indexed: int
