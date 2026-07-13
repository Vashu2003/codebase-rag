"""Chroma vector store — one collection per repo.

Persists to disk (settings.chroma_dir) so ingested repos survive restarts.
We pass our own embeddings in, so Chroma's default embedder is never used.
"""
from __future__ import annotations

import hashlib
import re

import chromadb

from .config import settings

_client = None


def _get_client():
    """Lazily build the persistent client so importing this module does no IO
    (keeps server boot + tests fast, and lets tests point CHROMA_DIR at a tmp)."""
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=settings.chroma_dir,
            settings=chromadb.Settings(anonymized_telemetry=False),
        )
    return _client


def _safe(repo: str) -> str:
    """Map a repo name to a valid, UNIQUE Chroma collection name.

    Chroma names: 3-63 chars, [a-zA-Z0-9._-], start+end alphanumeric, no
    consecutive periods. A readable slug alone would collide ("my repo",
    "my-repo", "my_repo" -> same), letting one repo's ingest overwrite
    another's index, so we append a hash of the raw name to keep it injective.
    """
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", repo).strip("-").lower()
    slug = slug[:48].rstrip("-") or "repo"
    digest = hashlib.sha1(repo.encode("utf8")).hexdigest()[:8]
    return f"repo-{slug}-{digest}"


def collection(repo: str):
    return _get_client().get_or_create_collection(
        name=_safe(repo),
        metadata={"hnsw:space": "cosine"},
    )


def reset(repo: str) -> None:
    try:
        _get_client().delete_collection(_safe(repo))
    except Exception:
        pass


def add(repo: str, ids, embeddings, documents, metadatas) -> None:
    collection(repo).add(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas,
    )


def query(repo: str, embedding, top_k: int):
    return collection(repo).query(
        query_embeddings=[embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )


def get_by_ids(repo: str, ids: list[str]) -> dict[str, str]:
    """Fetch chunk texts by id (used to hydrate graph neighbors). id -> document."""
    if not ids:
        return {}
    res = collection(repo).get(ids=ids, include=["documents"])
    return dict(zip(res.get("ids", []), res.get("documents", [])))
