"""Chroma vector store — one collection per repo.

Persists to disk (settings.chroma_dir) so ingested repos survive restarts.
We pass our own embeddings in, so Chroma's default embedder is never used.
"""
from __future__ import annotations

import re

import chromadb

from .config import settings

_client = chromadb.PersistentClient(path=settings.chroma_dir)


def _safe(repo: str) -> str:
    # Chroma collection names: 3-63 chars, alnum/._- , start+end alnum
    name = re.sub(r"[^a-zA-Z0-9._-]", "-", repo).strip("-._") or "repo"
    return f"repo-{name}"[:63]


def collection(repo: str):
    return _client.get_or_create_collection(
        name=_safe(repo),
        metadata={"hnsw:space": "cosine"},
    )


def reset(repo: str) -> None:
    try:
        _client.delete_collection(_safe(repo))
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
