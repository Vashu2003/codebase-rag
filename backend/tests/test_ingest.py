from pathlib import Path

import pytest

from app import ingest as ingest_mod
from app.ingest import ingest_repo


@pytest.fixture
def capture(monkeypatch):
    """Mock the two boundaries (embeddings + vector store) and record calls."""
    added: list[dict] = []
    reset_calls: list[str] = []

    monkeypatch.setattr(ingest_mod, "embed", lambda docs: [[0.0] for _ in docs])
    monkeypatch.setattr(ingest_mod.store, "reset", lambda repo: reset_calls.append(repo))
    monkeypatch.setattr(
        ingest_mod.store,
        "add",
        lambda repo, ids, embeddings, documents, metadatas: added.append(
            {"ids": ids, "metas": metadatas, "docs": documents}
        ),
    )
    # graph persistence is exercised in test_graph/test_ingest_graph; no-op here
    monkeypatch.setattr(ingest_mod.graph, "reset", lambda repo: None)
    monkeypatch.setattr(ingest_mod.graph, "add_nodes", lambda repo, rows: None)
    monkeypatch.setattr(ingest_mod.graph, "add_edges", lambda repo, edges, kind="ref": None)
    return {"added": added, "reset": reset_calls}


def test_indexes_only_supported_source(sample_repo: Path, capture):
    res = ingest_repo(str(sample_repo), "sample")
    files = {m["file"] for batch in capture["added"] for m in batch["metas"]}

    assert "calc.py" in files
    assert "app.ts" in files
    assert "README.md" in files
    assert "service.py" in files
    # node_modules skipped, unsupported extension skipped
    assert not any("node_modules" in f for f in files)
    assert "notes.txt" not in files
    assert res.files_indexed == 4


def test_reset_called_for_fresh_reingest(sample_repo: Path, capture):
    ingest_repo(str(sample_repo), "sample")
    assert capture["reset"] == ["sample"]


def test_size_cap_skips_large_files(tmp_path: Path, monkeypatch, capture):
    small = tmp_path / "small.py"
    small.write_text("def a():\n    return 1\n")
    big = tmp_path / "big.py"
    big.write_text("def b():\n    return 2\n" + "# pad\n" * 100)

    monkeypatch.setattr(ingest_mod, "MAX_BYTES", 40)
    res = ingest_repo(str(tmp_path), "sized")
    files = {m["file"] for batch in capture["added"] for m in batch["metas"]}
    assert "small.py" in files
    assert "big.py" not in files
    assert res.files_indexed == 1


def test_batching_flushes_in_chunks(sample_repo: Path, monkeypatch, capture):
    monkeypatch.setattr(ingest_mod, "BATCH", 1)
    ingest_repo(str(sample_repo), "batched")
    # BATCH=1 => one store.add call per chunk (more than one total)
    assert len(capture["added"]) > 1


def test_bad_path_raises(tmp_path: Path, capture):
    with pytest.raises(ValueError):
        ingest_repo(str(tmp_path / "does-not-exist"), "x")


def test_max_total_bytes_cap(tmp_path: Path, monkeypatch, capture):
    for i in range(3):
        (tmp_path / f"f{i}.py").write_text("def f():\n    return 1\n")
    monkeypatch.setattr(ingest_mod.settings, "max_total_bytes", 10)
    with pytest.raises(ValueError):
        ingest_repo(str(tmp_path), "big")
    # cap breach must fail BEFORE wiping any existing index
    assert capture["reset"] == []


def test_metadata_shape(sample_repo: Path, capture):
    ingest_repo(str(sample_repo), "sample")
    meta = capture["added"][0]["metas"][0]
    assert set(meta) == {"repo", "file", "start_line", "end_line", "symbol"}
    assert meta["repo"] == "sample"
    assert isinstance(meta["start_line"], int)
