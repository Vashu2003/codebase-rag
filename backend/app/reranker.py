"""Cross-encoder reranking (local, free — CrossEncoder ships with
sentence-transformers, no new dependency).

Bi-encoder embeddings score a chunk and the question in isolation (fast, coarse
recall). A cross-encoder reads (question, chunk) *together* and returns a real
relevance score (slow, precise) — too costly for the whole repo, ideal for
re-scoring the small merged candidate pool before the token budget. This is
what lets a genuinely-relevant graph neighbor outrank a weak vector seed.

Model downloads once on first use; lazily loaded so import stays cheap.
"""
from __future__ import annotations

import math
from functools import lru_cache

from .config import settings


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import CrossEncoder
    return CrossEncoder(settings.rerank_model)


@lru_cache(maxsize=1)
def _identity():
    # ask predict() for RAW logits: CrossEncoder.predict() applies the model's
    # default activation (Sigmoid for a 1-logit head like bge-reranker), so
    # letting it activate AND sigmoid-ing here would double-squash scores into
    # ~0.5-0.73 and tie the top matches. We normalize ourselves instead.
    import torch.nn as nn
    return nn.Identity()


def _sigmoid(x: float) -> float:
    if x <= -30:
        return 0.0
    if x >= 30:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


def rerank(question: str, cands: list) -> list:
    """Re-score each candidate against the question with the cross-encoder and
    sort by descending relevance. Sets `cand.score` to a 0-1 relevance (sigmoid
    of the raw logit). No-op on empty input; candidates are mutated in place.
    """
    if not cands:
        return cands
    logits = _model().predict(
        [(question, c.text) for c in cands], activation_fct=_identity()
    )
    for c, s in zip(cands, logits):
        c.score = _sigmoid(float(s))
    cands.sort(key=lambda c: c.score, reverse=True)
    return cands
