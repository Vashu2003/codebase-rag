"""Graph-aware, token-efficient retrieval, then a cited answer.

Pipeline:
  1. Vector seeds     — top-N Chroma hits for the question.
  2. Graph expansion  — pull each seed's callees/definitions and callers from
                        the code graph (1 hop), so the answer sees structurally
                        related code, not just text-similar code.
  3. Semantic dedup   — drop near-duplicate chunks (the "2-3 of top-10 say the
                        same thing" waste): containment / line-overlap / token
                        overlap.
  4. Token budget     — fill a fixed context budget by descending relevance,
                        head-trimming graph-only neighbors. Expansion therefore
                        *replaces* redundant vector hits rather than inflating
                        the prompt.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from starlette.concurrency import run_in_threadpool

from . import graph, reranker, store
from .config import settings
from .embeddings import embed_one
from .llm import complete
from .models import Citation, QueryResponse, RetrievalStats

log = logging.getLogger("codebase_rag")

MAX_TOP_K = 100
_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_MIN_DEDUP_TOKENS = 12    # below this, only exact/line-overlap dedup (not fuzzy)
_FRAME_TOKENS = 12        # per-chunk framing (header + code fence) in the prompt

SYSTEM = """You are a code-comprehension assistant. Answer the question using ONLY \
the numbered code excerpts below. Every claim must cite the excerpt it came from \
as [n] (the number in brackets). If the excerpts don't contain the answer, say so \
plainly — do not guess. Be concise and technical.

{context}

Question: {question}

Answer (cite excerpts as [n]):"""


@dataclass
class Cand:
    id: str
    text: str             # full retrieved chunk (used verbatim as the citation snippet)
    file: str
    start_line: int
    end_line: int
    symbol: str
    score: float
    source: str          # 'seed' | 'graph'
    edge: str | None = None
    prompt_text: str = ""  # what actually goes in the LLM prompt (may be head-trimmed)


def _token_est(text: str) -> int:
    return len(text) // 4 + 1          # ~4 chars/token; budget is the lever, not precision


def _wordset(text: str) -> set[str]:
    return {w.lower() for w in _WORD.findall(text)}


def _head_trim(text: str, n_lines: int) -> str:
    lines = text.splitlines()
    if len(lines) <= n_lines:
        return text
    return "\n".join(lines[:n_lines]) + "\n… (truncated)"


# ---- stage 1: vector seeds ----

def _seeds(repo: str, question: str, n: int) -> list[Cand]:
    res = store.query(repo, embed_one(question), n)
    ids = (res.get("ids") or [[]])[0]
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]
    out: list[Cand] = []
    for i, (doc, meta, dist) in enumerate(zip(docs, metas, dists)):
        out.append(Cand(
            id=ids[i] if i < len(ids) else f"seed-{i}",
            text=doc,
            file=meta["file"],
            start_line=meta["start_line"],
            end_line=meta["end_line"],
            symbol=meta.get("symbol") or "",
            score=max(0.0, 1.0 - float(dist)),   # cosine distance -> similarity, clamped
            source="seed",
        ))
    return out


# ---- stage 2: graph expansion ----

def _expand(repo: str, seeds: list[Cand]) -> list[Cand]:
    if not settings.graph_enabled or not seeds:
        return []
    rows = graph.neighbors(
        repo, [c.id for c in seeds], settings.graph_out_cap, settings.graph_in_cap
    )
    if not rows:
        return []
    id2text = store.get_by_ids(repo, [r["id"] for r in rows])
    seed_score = {c.id: c.score for c in seeds}
    fallback = max(seed_score.values(), default=0.0)
    out: list[Cand] = []
    for r in rows:
        text = id2text.get(r["id"])
        if not text:
            continue
        # score off the specific seed that pulled this neighbor (× decay), so a
        # neighbor of a weak seed can't outrank — and evict — a stronger seed.
        # (This heuristic is the ranking only when reranking is OFF; the
        # cross-encoder overwrites it when enabled.)
        parent = seed_score.get(r.get("via"), fallback)
        out.append(Cand(
            id=r["id"], text=text, file=r["file"],
            start_line=r["start_line"], end_line=r["end_line"],
            symbol=r.get("symbol") or "", score=parent * settings.graph_decay,
            source="graph", edge=r.get("edge"),
        ))
    return out


# ---- stage 3: semantic dedup ----

def _is_dup(c: Cand, kept: list[Cand]) -> bool:
    cw = _wordset(c.text)
    for k in kept:
        if c.file == k.file and c.start_line <= k.end_line and k.start_line <= c.end_line:
            return True                                  # overlapping lines, same file
        if c.text == k.text:
            return True                                  # identical body (any size)
        kw = _wordset(k.text)
        # fuzzy matches only for substantial chunks — otherwise distinct
        # one-liners (e.g. `get_x` vs `get_y`) collapse into one.
        if len(cw) < _MIN_DEDUP_TOKENS or len(kw) < _MIN_DEDUP_TOKENS:
            continue
        if c.text in k.text or k.text in c.text:
            return True                                  # substantial containment
        union = len(cw | kw)
        if union and len(cw & kw) / union >= settings.dedup_overlap:
            return True                                  # Jaccard paraphrase
    return False


def _dedup(cands: list[Cand]) -> list[Cand]:
    kept: list[Cand] = []
    # sort by score, and on a tie keep the direct vector seed over a graph
    # neighbor (avoids a neighbor mis-citing a spot a seed already matched).
    ordered = sorted(cands, key=lambda x: (x.score, x.source == "seed"), reverse=True)
    for c in ordered:
        if not _is_dup(c, kept):
            kept.append(c)
    return kept


# ---- stage 4: token budget ----

def _fit_budget(cands: list[Cand]) -> tuple[list[Cand], int]:
    kept: list[Cand] = []
    used = 0
    for c in cands:
        # head-trim graph neighbors for the PROMPT only; keep c.text full so the
        # citation snippet (code panel) always shows the whole chunk.
        c.prompt_text = (
            _head_trim(c.text, settings.neighbor_head_lines)
            if c.source == "graph" else c.text
        )
        t = _token_est(c.prompt_text) + _FRAME_TOKENS     # include per-chunk prompt framing
        if kept and used + t > settings.context_token_budget:
            break                                        # top hit always survives
        kept.append(c)
        used += t
    return kept, used


def _retrieve(repo: str, question: str, k: int) -> tuple[list[Cand], RetrievalStats]:
    seeds = _seeds(repo, question, max(k, settings.seed_k))
    if not seeds:
        return [], RetrievalStats(seeds=0, graph_neighbors=0, after_dedup=0,
                                  sent=0, est_tokens=0, graph_used=False,
                                  reranked=False)
    neighbors = _expand(repo, seeds)
    pool = seeds + neighbors
    # rerank the merged pool so graph neighbors compete with seeds on real
    # (question, chunk) relevance rather than the pre-rerank cosine/decay score.
    # The pool is capped first (by that pre-rerank score) only to bound
    # cross-encoder latency; rerank_pool is sized so the cap rarely bites.
    reranked = settings.rerank_enabled
    if reranked:
        pool.sort(key=lambda c: c.score, reverse=True)
        pool = reranker.rerank(question, pool[:settings.rerank_pool])
    deduped = _dedup(pool)
    kept, used = _fit_budget(deduped)
    stats = RetrievalStats(
        seeds=len(seeds),
        graph_neighbors=len(neighbors),
        after_dedup=len(deduped),
        sent=len(kept),
        est_tokens=used,
        graph_used=any(c.source == "graph" for c in kept),
        reranked=reranked,
    )
    return kept, stats


def _build_context(cands: list[Cand]) -> str:
    blocks = []
    for i, c in enumerate(cands, 1):
        loc = f"{c.file}:{c.start_line}-{c.end_line}"
        sym = f" ({c.symbol})" if c.symbol else ""
        via = " [via call-graph]" if c.source == "graph" else ""
        body = c.prompt_text or c.text
        blocks.append(f"[{i}] {loc}{sym}{via}\n```\n{body}\n```")
    return "\n\n".join(blocks)


async def answer(repo: str, question: str, top_k: int | None) -> QueryResponse:
    k = min(max(1, top_k or settings.top_k), MAX_TOP_K)
    # retrieval is CPU/IO-bound and synchronous; keep it off the event loop
    kept, stats = await run_in_threadpool(_retrieve, repo, question, k)
    if not kept:
        return QueryResponse(
            answer="No indexed content for this repo. Ingest it first.",
            citations=[],
            retrieval=stats,
        )
    text = await complete(SYSTEM.format(context=_build_context(kept), question=question))
    citations = [
        Citation(
            repo=repo, file=c.file, start_line=c.start_line, end_line=c.end_line,
            symbol=c.symbol or None, score=round(c.score, 4),
            source=c.source, edge=c.edge, snippet=c.text,
        )
        for c in kept
    ]
    log.info(
        "retrieval repo=%s seeds=%d neighbors=%d dedup=%d sent=%d est_tokens=%d "
        "graph=%s reranked=%s",
        repo, stats.seeds, stats.graph_neighbors, stats.after_dedup,
        stats.sent, stats.est_tokens, stats.graph_used, stats.reranked,
    )
    return QueryResponse(answer=text, citations=citations, retrieval=stats)
