import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import rag
from .config import settings
from .ingest import ingest_repo
from .models import (
    IngestRequest,
    IngestResponse,
    QueryRequest,
    QueryResponse,
)

log = logging.getLogger("codebase_rag")

app = FastAPI(title="codebase-rag", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "llm_provider": settings.llm_provider}


@app.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest):
    try:
        return ingest_repo(req.path, req.repo)
    except ValueError as e:
        # these messages are safe/actionable (bad path, outside root, cap hit)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        log.exception("ingest failed for repo=%s", req.repo)
        raise HTTPException(status_code=500, detail="ingest failed")


@app.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    try:
        return await rag.answer(req.repo, req.question, req.top_k)
    except Exception:
        # never surface raw internals (may embed provider keys / paths)
        log.exception("query failed for repo=%s", req.repo)
        raise HTTPException(status_code=500, detail="query failed")
