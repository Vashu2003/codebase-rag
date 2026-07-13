import pytest

from app import rag as rag_mod


def _meta(file="calc.py", s=1, e=5, symbol="add"):
    return {"file": file, "start_line": s, "end_line": e, "symbol": symbol}


def test_build_context_numbers_and_fences():
    hits = [
        ("def add(): ...", _meta("calc.py", 1, 5, "add"), 0.9),
        ("class Widget {}", _meta("app.ts", 10, 20, "Widget"), 0.8),
    ]
    ctx = rag_mod._build_context(hits)
    assert "[1]" in ctx and "[2]" in ctx
    assert "calc.py:1-5" in ctx
    assert "app.ts:10-20" in ctx
    assert "(add)" in ctx
    assert "```" in ctx


def test_retrieve_maps_cosine_distance_to_similarity(monkeypatch):
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.1, 0.2])
    monkeypatch.setattr(
        rag_mod.store,
        "query",
        lambda repo, emb, k: {
            "documents": [["doc-a", "doc-b"]],
            "metadatas": [[_meta("calc.py"), _meta("app.ts")]],
            "distances": [[0.1, 0.4]],
        },
    )
    hits = rag_mod._retrieve("r", "q", 2)
    assert [round(s, 3) for _d, _m, s in hits] == [0.9, 0.6]


async def test_answer_returns_citations(monkeypatch):
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    monkeypatch.setattr(
        rag_mod.store,
        "query",
        lambda repo, emb, k: {
            "documents": [["def add(): ..."]],
            "metadatas": [[_meta("calc.py", 6, 8, "add")]],
            "distances": [[0.2]],
        },
    )

    async def fake_complete(prompt):
        assert "def add" in prompt          # retrieved chunk reached the LLM
        return "add() lives in calc.py [1]"

    monkeypatch.setattr(rag_mod, "complete", fake_complete)

    resp = await rag_mod.answer("r", "where is add?", None)
    assert "[1]" in resp.answer
    assert len(resp.citations) == 1
    c = resp.citations[0]
    assert c.file == "calc.py"
    assert c.start_line == 6 and c.end_line == 8
    assert c.symbol == "add"
    assert 0 < c.score <= 1


def test_score_never_negative(monkeypatch):
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    monkeypatch.setattr(
        rag_mod.store,
        "query",
        lambda repo, emb, k: {
            "documents": [["d"]],
            "metadatas": [[_meta()]],
            "distances": [[1.5]],   # near-orthogonal -> raw similarity would be -0.5
        },
    )
    hits = rag_mod._retrieve("r", "q", 1)
    assert hits[0][2] == 0.0


async def test_top_k_is_clamped(monkeypatch):
    seen = {}

    def fake_query(repo, emb, k):
        seen["k"] = k
        return {"documents": [[]], "metadatas": [[]], "distances": [[]]}

    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    monkeypatch.setattr(rag_mod.store, "query", fake_query)
    await rag_mod.answer("r", "q", 10_000_000)
    assert seen["k"] == rag_mod.MAX_TOP_K


async def test_answer_empty_hits_skips_llm(monkeypatch):
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    monkeypatch.setattr(
        rag_mod.store,
        "query",
        lambda repo, emb, k: {"documents": [[]], "metadatas": [[]], "distances": [[]]},
    )

    async def boom(prompt):
        raise AssertionError("LLM must not be called when there are no hits")

    monkeypatch.setattr(rag_mod, "complete", boom)

    resp = await rag_mod.answer("r", "anything", None)
    assert resp.citations == []
    assert "ingest" in resp.answer.lower()
