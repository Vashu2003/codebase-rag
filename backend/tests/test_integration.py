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
