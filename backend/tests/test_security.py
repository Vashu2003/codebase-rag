import os

import httpx
import pytest
import respx

from app import ingest as ingest_mod
from app import llm as llm_mod
from app.config import settings
from app.ingest import ingest_repo


@pytest.fixture
def mock_store(monkeypatch):
    added: list[dict] = []
    monkeypatch.setattr(ingest_mod, "embed", lambda docs: [[0.0] for _ in docs])
    monkeypatch.setattr(ingest_mod.store, "reset", lambda repo: None)
    monkeypatch.setattr(
        ingest_mod.store,
        "add",
        lambda repo, ids, embeddings, documents, metadatas: added.extend(metadatas),
    )
    return added


def _indexed_files(metas):
    return {m["file"] for m in metas}


def test_ingest_root_blocks_outside_path(tmp_path, monkeypatch, mock_store):
    allowed = tmp_path / "allowed"
    outside = tmp_path / "outside"
    allowed.mkdir()
    outside.mkdir()
    (outside / "x.py").write_text("def x():\n    return 1\n")

    monkeypatch.setattr(settings, "ingest_root", str(allowed))
    with pytest.raises(ValueError):
        ingest_repo(str(outside), "r")


def test_ingest_root_allows_inside_path(tmp_path, monkeypatch, mock_store):
    allowed = tmp_path / "allowed"
    inner = allowed / "proj"
    inner.mkdir(parents=True)
    (inner / "a.py").write_text("def a():\n    return 1\n")

    monkeypatch.setattr(settings, "ingest_root", str(allowed))
    res = ingest_repo(str(inner), "r")
    assert res.files_indexed == 1


def test_symlink_escaping_root_is_skipped(tmp_path, mock_store):
    root = tmp_path / "root"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (outside / "secret.py").write_text("SECRET = 'do-not-index'\n")
    (root / "real.py").write_text("def real():\n    return 1\n")
    os.symlink(outside / "secret.py", root / "link.py")

    ingest_repo(str(root), "r")
    files = _indexed_files(mock_store)
    assert "real.py" in files
    assert "link.py" not in files


def test_max_files_cap_enforced(tmp_path, monkeypatch, mock_store):
    for i in range(3):
        (tmp_path / f"m{i}.py").write_text(f"def f{i}():\n    return {i}\n")
    monkeypatch.setattr(settings, "max_files", 1)
    with pytest.raises(ValueError):
        ingest_repo(str(tmp_path), "r")


@respx.mock
async def test_gemini_key_in_header_never_in_url(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "top-secret-key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-2.0-flash")
    seen = {}

    def responder(request):
        seen["url"] = str(request.url)
        seen["header"] = request.headers.get("x-goog-api-key")
        return httpx.Response(
            200, json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}
        )

    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.0-flash:generateContent"
    ).mock(side_effect=responder)

    await llm_mod._gemini("prompt")
    assert seen["header"] == "top-secret-key"
    assert "top-secret-key" not in seen["url"]
