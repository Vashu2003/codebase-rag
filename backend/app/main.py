import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import embeddings, graph, rag, reranker
from .config import settings
from .ingest import ingest_source
from .models import (
    IngestRequest,
    IngestResponse,
    QueryRequest,
    QueryResponse,
)

log = logging.getLogger("codebase_rag")


def _warm_models() -> None:
    """Load the embedding (and, if enabled, reranker) models so the FIRST query
    doesn't pay the download/load. Runs in a daemon thread — startup stays
    instant and the server serves /health immediately while models load."""
    try:
        embeddings._model()
        if settings.rerank_enabled:
            reranker._model()
        log.info("models warmed")
    except Exception:
        log.exception("model warmup failed (will lazy-load on first query)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_warm_models, daemon=True).start()
    yield


app = FastAPI(title="codebase-rag", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "llm_provider": settings.llm_provider}


@app.get("/repos")
def repos():
    """Indexed repos (for the UI's repo switcher). Empty if graph is disabled."""
    if not settings.graph_enabled:
        return []
    try:
        return graph.list_repos()
    except Exception:
        log.exception("listing repos failed")
        return []


@app.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest):
    try:
        return ingest_source(repo=req.repo, path=req.path, url=req.url)
    except ValueError as e:
        # these messages are safe/actionable (bad path/url, outside root, cap hit)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        log.exception("ingest failed for repo=%s url=%s", req.repo, req.url)
        raise HTTPException(status_code=500, detail="ingest failed")


@app.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    try:
        return await rag.answer(req.repo, req.question, req.top_k)
    except Exception:
        # never surface raw internals (may embed provider keys / paths)
        log.exception("query failed for repo=%s", req.repo)
        raise HTTPException(status_code=500, detail="query failed")
