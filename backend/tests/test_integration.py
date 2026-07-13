"""End-to-end wiring with REAL embeddings (mock only the LLM boundary).

Proves ingest -> embed -> Chroma -> retrieve -> cite actually works together.
Marked slow: first run downloads the bge-small model (~130MB).
Run with: pytest -m slow
"""
import pytest

from app import rag as rag_mod
from app.ingest import ingest_repo

pytestmark = pytest.mark.slow


async def test_ingest_then_query_cites_correct_file(sample_repo, monkeypatch):
    res = ingest_repo(str(sample_repo), "integration")
    assert res.chunks_indexed > 0

    async def echo(prompt):
        return "see excerpt [1]"

    monkeypatch.setattr(rag_mod, "complete", echo)

    resp = await rag_mod.answer(
        "integration", "where is the add function defined?", None
    )
    files = {c.file for c in resp.citations}
    # semantic retrieval should surface calc.py (which defines add) near the top
    assert "calc.py" in files
    top = resp.citations[0]
    assert 0 < top.score <= 1


def test_graph_expansion_pulls_callee(sample_repo):
    # Real ingest builds the graph from tree-sitter; expanding the caller
    # (service.total) must hydrate the callee's definition (calc.add) out of
    # Chroma. Deterministic — seeds the caller by its real node id rather than
    # relying on embedding ranking over an 8-chunk corpus.
    from app import graph
    from app.rag import Cand, _expand

    ingest_repo(str(sample_repo), "integration_graph")
    row = graph._get_conn().execute(
        "SELECT id, file, start_line, end_line FROM nodes "
        "WHERE repo = ? AND symbol = 'total'",
        ("integration_graph",),
    ).fetchone()
    assert row, "service.total node should exist"
    sid, file, s, e = row
    seed = Cand(id=sid, text="", file=file, start_line=s, end_line=e,
                symbol="total", score=0.9, source="seed")

    neighbors = _expand("integration_graph", [seed])
    assert any(n.file == "calc.py" and n.symbol == "add" for n in neighbors)
    assert all(n.text for n in neighbors)   # neighbor text hydrated from Chroma


async def test_reranker_runs_end_to_end(sample_repo, monkeypatch):
    # real cross-encoder (downloads bge-reranker-base once) over a real ingest
    monkeypatch.setattr(rag_mod.settings, "rerank_enabled", True)
    ingest_repo(str(sample_repo), "integration_rerank")

    async def echo(prompt):
        return "see [1]"

    monkeypatch.setattr(rag_mod, "complete", echo)
    resp = await rag_mod.answer("integration_rerank", "how does add sum two numbers?", None)
    assert resp.retrieval.reranked is True
    assert all(0.0 <= c.score <= 1.0 for c in resp.citations)   # sigmoid scores
    # the add() definition should rank into the top results after reranking
    assert any(c.symbol == "add" for c in resp.citations[:3])
