"""Local, free embeddings via sentence-transformers.

Model downloads once (~130MB for bge-small) and runs offline on CPU/MPS.
Lazily loaded so `import` stays cheap and the server boots fast.
"""
from __future__ import annotations

from functools import lru_cache

from .config import settings


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(settings.embed_model)


def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    vecs = _model().encode(
        texts,
        normalize_embeddings=True,   # cosine == dot product
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    return vecs.tolist()


def embed_one(text: str) -> list[float]:
    return embed([text])[0]
