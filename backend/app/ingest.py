"""Ingest a local repo checkout: walk -> chunk -> embed -> store."""
from __future__ import annotations

from pathlib import Path

from . import store
from .chunker import chunk_file
from .embeddings import embed
from .models import IngestResponse

# skip noise; keep the index about *source*
SKIP_DIRS = {
    ".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build",
    ".next", ".chroma", "target", ".idea", ".vscode", "vendor", "coverage",
}
KEEP_EXT = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java", ".rb",
    ".c", ".h", ".cpp", ".dart", ".md",
}
MAX_BYTES = 1_000_000  # skip huge generated/minified files
BATCH = 128


def _iter_files(root: Path):
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.suffix.lower() not in KEEP_EXT:
            continue
        try:
            if p.stat().st_size > MAX_BYTES:
                continue
        except OSError:
            continue
        yield p


def ingest_repo(path: str, repo: str) -> IngestResponse:
    root = Path(path).expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"not a directory: {root}")

    store.reset(repo)  # fresh index on re-ingest

    ids: list[str] = []
    docs: list[str] = []
    metas: list[dict] = []
    files_indexed = 0
    total_chunks = 0

    def flush():
        nonlocal ids, docs, metas
        if not ids:
            return
        vecs = embed(docs)
        store.add(repo, ids, vecs, docs, metas)
        ids, docs, metas = [], [], []

    for f in _iter_files(root):
        chunks = chunk_file(root, f)
        if not chunks:
            continue
        files_indexed += 1
        for i, ch in enumerate(chunks):
            total_chunks += 1
            ids.append(f"{ch.file}:{ch.start_line}:{i}")
            docs.append(ch.text)
            metas.append({
                "repo": repo,
                "file": ch.file,
                "start_line": ch.start_line,
                "end_line": ch.end_line,
                "symbol": ch.symbol or "",
            })
            if len(ids) >= BATCH:
                flush()
    flush()

    return IngestResponse(
        repo=repo,
        files_indexed=files_indexed,
        chunks_indexed=total_chunks,
    )
