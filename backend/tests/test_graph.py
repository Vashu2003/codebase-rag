"""Tests for the SQLite code graph and edge-building during ingest."""
import pytest

from app import graph
from app import ingest as ingest_mod
from app.ingest import ingest_repo


def _nodes():
    return [
        {"id": "a", "file": "a.py", "start_line": 1, "end_line": 3, "symbol": "fa"},
        {"id": "b", "file": "b.py", "start_line": 1, "end_line": 3, "symbol": "fb"},
        {"id": "c", "file": "c.py", "start_line": 1, "end_line": 3, "symbol": "fc"},
    ]


def test_callees_and_callers():
    repo = "g1"
    graph.reset(repo)
    graph.add_nodes(repo, _nodes())
    graph.add_edges(repo, [("a", "b")])          # a references b

    callees = graph.neighbors(repo, ["a"], out_cap=5, in_cap=5)
    assert {n["id"] for n in callees} == {"b"}    # a's callee is b

    callers = graph.neighbors(repo, ["b"], out_cap=5, in_cap=5)
    assert {n["id"] for n in callers} == {"a"}    # b's caller is a


def test_seeds_excluded_from_neighbors():
    repo = "g2"
    graph.reset(repo)
    graph.add_nodes(repo, _nodes())
    graph.add_edges(repo, [("a", "b"), ("b", "a")])
    out = graph.neighbors(repo, ["a", "b"], out_cap=5, in_cap=5)
    assert out == []                              # both endpoints are seeds


def test_caps_limit_expansion():
    repo = "g3"
    graph.reset(repo)
    nodes = [{"id": str(i), "file": f"{i}.py", "start_line": 1, "end_line": 1,
              "symbol": f"s{i}"} for i in range(10)]
    graph.add_nodes(repo, nodes)
    graph.add_edges(repo, [("0", str(i)) for i in range(1, 10)])  # 0 -> 1..9
    out = graph.neighbors(repo, ["0"], out_cap=3, in_cap=0)
    assert len(out) == 3                          # out_cap honored


def test_caps_sum_across_seeds():
    repo = "g4"
    graph.reset(repo)
    nodes = [{"id": str(i), "file": f"{i}.py", "start_line": 1, "end_line": 1,
              "symbol": f"s{i}"} for i in range(6)]
    graph.add_nodes(repo, nodes)
    graph.add_edges(repo, [("0", "2"), ("0", "3"), ("1", "4"), ("1", "5")])
    out = graph.neighbors(repo, ["0", "1"], out_cap=2, in_cap=0)
    assert {n["id"] for n in out} == {"2", "3", "4", "5"}   # per-seed cap, summed
    assert all(n["via"] in {"0", "1"} for n in out)         # records connecting seed


def test_repo_isolation_and_reset():
    graph.reset("iso_a")
    graph.reset("iso_b")
    graph.add_nodes("iso_a", _nodes())
    graph.add_edges("iso_a", [("a", "b")])
    assert graph.neighbors("iso_b", ["a"], 5, 5) == []     # other repo sees nothing
    graph.reset("iso_a")
    assert graph.neighbors("iso_a", ["a"], 5, 5) == []     # reset clears it


def test_missing_graph_returns_empty():
    assert graph.neighbors("never-ingested", ["x"], 5, 5) == []


def test_list_repos_counts_files_and_chunks():
    graph.reset("lr")
    graph.add_nodes("lr", [
        {"id": "a", "file": "x.py", "start_line": 1, "end_line": 2, "symbol": "a"},
        {"id": "b", "file": "y.py", "start_line": 1, "end_line": 2, "symbol": "b"},
        {"id": "c", "file": "x.py", "start_line": 3, "end_line": 4, "symbol": "c"},
    ])
    entry = {r["repo"]: r for r in graph.list_repos()}["lr"]
    assert entry["files"] == 2 and entry["chunks"] == 3


@pytest.fixture
def mock_boundaries(monkeypatch):
    monkeypatch.setattr(ingest_mod, "embed", lambda docs: [[0.0] for _ in docs])
    monkeypatch.setattr(ingest_mod.store, "reset", lambda repo: None)
    monkeypatch.setattr(
        ingest_mod.store, "add",
        lambda repo, ids, embeddings, documents, metadatas: None,
    )


def test_ingest_builds_cross_file_edge(sample_repo, mock_boundaries):
    # edge resolution needs AST symbols; without tree-sitter calc.py windows
    # with symbol=None and the edge can't form. Skip rather than false-fail.
    from app import chunker
    if not chunker._HAS_TS:
        pytest.skip("tree-sitter not available")
    # real graph, mocked vector store: service.total() calls calc.add()
    ingest_repo(str(sample_repo), "edges")
    conn = graph._get_conn()
    rows = conn.execute(
        "SELECT ns.file, nd.file, nd.symbol FROM edges e "
        "JOIN nodes ns ON ns.repo = e.repo AND ns.id = e.src "
        "JOIN nodes nd ON nd.repo = e.repo AND nd.id = e.dst "
        "WHERE e.repo = ?",
        ("edges",),
    ).fetchall()
    assert any(
        sf == "service.py" and df == "calc.py" and dsym == "add"
        for sf, df, dsym in rows
    ), "expected an edge service.py -> calc.py(add)"
