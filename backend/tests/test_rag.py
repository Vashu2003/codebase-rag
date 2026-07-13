import pytest

from app import rag as rag_mod
from app.rag import Cand


def _meta(file="calc.py", s=1, e=5, symbol="add"):
    return {"file": file, "start_line": s, "end_line": e, "symbol": symbol}


def _qresult(docs, metas, dists, ids=None):
    ids = ids or [f"id{i}" for i in range(len(docs))]
    return {"ids": [ids], "documents": [docs], "metadatas": [metas], "distances": [dists]}


def _cand(text, file="f.py", s=1, e=2, score=0.9, source="seed"):
    return Cand(id=f"{file}:{s}", text=text, file=file, start_line=s, end_line=e,
                symbol="", score=score, source=source)


@pytest.fixture(autouse=True)
def _no_graph(monkeypatch):
    """Default tests to pure-vector; graph-specific tests opt back in."""
    monkeypatch.setattr(rag_mod.settings, "graph_enabled", False)


def test_build_context_numbers_marks_graph_and_fences():
    cands = [
        _cand("def add(): ...", "calc.py", 1, 5, source="seed"),
        _cand("class Widget {}", "app.ts", 10, 20, source="graph"),
    ]
    cands[0].symbol = "add"
    ctx = rag_mod._build_context(cands)
    assert "[1]" in ctx and "[2]" in ctx
    assert "calc.py:1-5" in ctx and "app.ts:10-20" in ctx
    assert "(add)" in ctx
    assert "[via call-graph]" in ctx          # graph-sourced chunk is marked
    assert "```" in ctx


def test_seed_scores_map_cosine_distance(monkeypatch):
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.1, 0.2])
    monkeypatch.setattr(
        rag_mod.store, "query",
        lambda repo, emb, k: _qresult(
            ["doc-a", "doc-b"], [_meta("calc.py"), _meta("app.ts")], [0.1, 0.4]
        ),
    )
    kept, _ = rag_mod._retrieve("r", "q", 2)
    assert sorted(round(c.score, 3) for c in kept) == [0.6, 0.9]


def test_score_never_negative(monkeypatch):
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    monkeypatch.setattr(
        rag_mod.store, "query",
        lambda repo, emb, k: _qresult(["d"], [_meta()], [1.5]),  # would be -0.5 unclamped
    )
    kept, _ = rag_mod._retrieve("r", "q", 1)
    assert kept[0].score == 0.0


def test_dedup_drops_near_duplicates(monkeypatch):
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    dup = "def add(a, b):\n    return a + b"
    monkeypatch.setattr(
        rag_mod.store, "query",
        lambda repo, emb, k: _qresult(
            [dup, dup, "class Widget:\n    pass"],
            [_meta("a.py", 1, 2), _meta("b.py", 5, 6), _meta("c.py", 9, 10)],
            [0.1, 0.15, 0.2],
        ),
    )
    kept, stats = rag_mod._retrieve("r", "q", 5)
    assert stats.seeds == 3
    assert stats.after_dedup == 2               # the two identical bodies collapse to one


async def test_budget_trims_context(monkeypatch):
    monkeypatch.setattr(rag_mod.settings, "context_token_budget", 30)  # ~120 chars
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    big = [("x" * 400 + f" u{i}") for i in range(6)]  # each ~100 tokens, unique
    monkeypatch.setattr(
        rag_mod.store, "query",
        lambda repo, emb, k: _qresult(
            big, [_meta(f"f{i}.py", i, i) for i in range(6)], [0.1 * i for i in range(6)]
        ),
    )
    kept, stats = rag_mod._retrieve("r", "q", 6)
    assert len(kept) >= 1                        # top hit always kept
    assert len(kept) < 6                         # budget stops it well short of all 6
    assert stats.est_tokens <= 30 + 120          # bounded (top hit may overshoot alone)


def test_dedup_keeps_distinct_short_oneliners():
    # short, distinct one-liners must NOT collapse (regression: min()-overlap bug)
    a = _cand("def get_x(self): return self.x", "a.py", 1, 1, score=0.9)
    b = _cand("def get_y(self): return self.y", "b.py", 2, 2, score=0.8)
    assert len(rag_mod._dedup([a, b])) == 2


def test_dedup_collapses_jaccard_paraphrase():
    base = " ".join(f"word{i}" for i in range(30))
    a = _cand(base + " tail_a", "a.py", 1, 5, score=0.9)
    b = _cand(base + " tail_b", "b.py", 20, 25, score=0.8)   # >0.72 Jaccard, diff file
    kept = rag_mod._dedup([a, b])
    assert len(kept) == 1
    assert kept[0].file == "a.py"                            # higher score survives


def test_dedup_prefers_seed_over_neighbor_on_tie():
    base = " ".join(f"tok{i}" for i in range(30))
    seed = _cand(base + " s", "a.py", 1, 5, score=0.7, source="seed")
    neigh = _cand(base + " n", "b.py", 9, 12, score=0.7, source="graph")
    kept = rag_mod._dedup([neigh, seed])                     # neighbor listed first
    assert len(kept) == 1
    assert kept[0].source == "seed"                          # seed wins the tie


def test_head_trim():
    text = "\n".join(f"line{i}" for i in range(50))
    trimmed = rag_mod._head_trim(text, 10)
    assert trimmed.startswith("line0")
    assert "truncated" in trimmed
    assert len(trimmed.splitlines()) <= 12
    assert rag_mod._head_trim("a\nb", 10) == "a\nb"          # short text untouched


def test_graph_neighbor_is_merged(monkeypatch):
    monkeypatch.setattr(rag_mod.settings, "graph_enabled", True)
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    monkeypatch.setattr(
        rag_mod.store, "query",
        lambda repo, emb, k: _qresult(
            ["def total(items): return add(...)"],
            [_meta("service.py", 6, 8, "total")], [0.2], ids=["service.py:6"],
        ),
    )
    monkeypatch.setattr(
        rag_mod.graph, "neighbors",
        lambda repo, ids, o, i: [{
            "id": "calc.py:6", "file": "calc.py", "start_line": 6, "end_line": 8,
            "symbol": "add", "edge": "ref", "via": "service.py:6",
        }],
    )
    monkeypatch.setattr(
        rag_mod.store, "get_by_ids",
        lambda repo, ids: {"calc.py:6": "def add(a, b): return a + b"},
    )
    kept, stats = rag_mod._retrieve("r", "how does total work?", 5)
    files = {c.file for c in kept}
    assert files == {"service.py", "calc.py"}    # callee definition pulled in
    assert stats.graph_neighbors == 1
    assert stats.graph_used is True
    # neighbor scored off its connecting seed (0.8) × decay, not a flat base
    neighbor = next(c for c in kept if c.file == "calc.py")
    assert neighbor.score == pytest.approx(0.8 * rag_mod.settings.graph_decay)


def test_retrieve_applies_reranking(monkeypatch):
    monkeypatch.setattr(rag_mod.settings, "rerank_enabled", True)
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    monkeypatch.setattr(
        rag_mod.store, "query",
        lambda repo, emb, k: _qresult(
            ["off-topic but similar", "the real answer"],
            [_meta("a.py", 1, 2), _meta("b.py", 3, 4)],
            [0.1, 0.5],   # a.py has the better vector score
        ),
    )

    def fake_rerank(question, cands):
        for c in cands:                 # cross-encoder prefers b.py
            c.score = 0.99 if c.file == "b.py" else 0.01
        cands.sort(key=lambda c: c.score, reverse=True)
        return cands

    monkeypatch.setattr(rag_mod.reranker, "rerank", fake_rerank)
    kept, stats = rag_mod._retrieve("r", "q", 5)
    assert stats.reranked is True
    assert kept[0].file == "b.py"       # reranker order wins over vector order


async def test_answer_returns_citations_and_stats(monkeypatch):
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    monkeypatch.setattr(
        rag_mod.store, "query",
        lambda repo, emb, k: _qresult(["def add(): ..."], [_meta("calc.py", 6, 8, "add")], [0.2]),
    )

    async def fake_complete(prompt):
        assert "def add" in prompt
        return "add() lives in calc.py [1]"

    monkeypatch.setattr(rag_mod, "complete", fake_complete)
    resp = await rag_mod.answer("r", "where is add?", None)
    assert "[1]" in resp.answer
    assert len(resp.citations) == 1
    c = resp.citations[0]
    assert c.file == "calc.py" and c.start_line == 6 and c.symbol == "add"
    assert resp.retrieval.seeds == 1
    assert resp.retrieval.reranked is False   # disabled in tests by default


async def test_top_k_is_clamped(monkeypatch):
    seen = {}

    def fake_query(repo, emb, k):
        seen["k"] = k
        return _qresult([], [], [])

    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    monkeypatch.setattr(rag_mod.store, "query", fake_query)
    await rag_mod.answer("r", "q", 10_000_000)
    assert seen["k"] == rag_mod.MAX_TOP_K        # seeds = max(clamped k, seed_k) = 100


async def test_answer_empty_hits_skips_llm(monkeypatch):
    monkeypatch.setattr(rag_mod, "embed_one", lambda q: [0.0])
    monkeypatch.setattr(rag_mod.store, "query", lambda repo, emb, k: _qresult([], [], []))

    async def boom(prompt):
        raise AssertionError("LLM must not be called when there are no hits")

    monkeypatch.setattr(rag_mod, "complete", boom)
    resp = await rag_mod.answer("r", "anything", None)
    assert resp.citations == []
    assert "ingest" in resp.answer.lower()
