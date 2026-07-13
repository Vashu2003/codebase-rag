"""Retrieve relevant chunks, then generate a cited answer."""
from __future__ import annotations

from . import store
from .config import settings
from .embeddings import embed_one
from .llm import complete
from .models import Citation, QueryResponse

SYSTEM = """You are a code-comprehension assistant. Answer the question using ONLY \
the numbered code excerpts below. Every claim must cite the excerpt it came from \
as [n] (the number in brackets). If the excerpts don't contain the answer, say so \
plainly — do not guess. Be concise and technical.

{context}

Question: {question}

Answer (cite excerpts as [n]):"""


def _retrieve(repo: str, question: str, top_k: int):
    qvec = embed_one(question)
    res = store.query(repo, qvec, top_k)
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]
    hits = []
    for doc, meta, dist in zip(docs, metas, dists):
        hits.append((doc, meta, 1.0 - float(dist)))  # cosine distance -> similarity
    return hits


def _build_context(hits) -> str:
    blocks = []
    for i, (doc, meta, _score) in enumerate(hits, 1):
        loc = f"{meta['file']}:{meta['start_line']}-{meta['end_line']}"
        sym = f" ({meta['symbol']})" if meta.get("symbol") else ""
        blocks.append(f"[{i}] {loc}{sym}\n```\n{doc}\n```")
    return "\n\n".join(blocks)


async def answer(repo: str, question: str, top_k: int | None) -> QueryResponse:
    k = top_k or settings.top_k
    hits = _retrieve(repo, question, k)
    if not hits:
        return QueryResponse(
            answer="No indexed content for this repo. Ingest it first.",
            citations=[],
        )
    prompt = SYSTEM.format(context=_build_context(hits), question=question)
    text = await complete(prompt)
    citations = [
        Citation(
            repo=repo,
            file=m["file"],
            start_line=m["start_line"],
            end_line=m["end_line"],
            symbol=m.get("symbol") or None,
            score=round(score, 4),
        )
        for _doc, m, score in hits
    ]
    return QueryResponse(answer=text, citations=citations)
