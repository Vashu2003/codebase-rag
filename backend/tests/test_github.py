"""URL validation, repo-name derivation, hardened clone, and orchestration.
The clone subprocess is always mocked — no network in the test suite."""
import os
import subprocess

import pytest

from app import github
from app import ingest as ingest_mod
from app.github import derive_repo_name, validate_url
from app.models import IngestResponse


@pytest.mark.parametrize("url", [
    "https://github.com/owner/repo",
    "https://github.com/owner/repo.git",
    "https://github.com/owner/repo/",
])
def test_validate_accepts_github_https(url):
    assert validate_url(url)


@pytest.mark.parametrize("url", [
    "ssh://git@github.com/o/r",     # non-https scheme
    "git://github.com/o/r",
    "file:///etc/passwd",           # local file read
    "http://github.com/o/r",        # plain http
    "https://evil.com/o/r",         # host not allowlisted
    "https://github.com/owner",     # not owner/repo
    "--upload-pack=/bin/sh",        # git option injection
    "https://github.com/o/r; rm -rf /",   # shell metachars
    "https://github.com/o/r extra", # embedded space
])
def test_validate_rejects_bad_urls(url):
    with pytest.raises(ValueError):
        validate_url(url)


def test_host_allowlist_is_configurable(monkeypatch):
    monkeypatch.setattr(github.settings, "git_allowed_hosts", "gitlab.com, github.com")
    assert validate_url("https://gitlab.com/o/r")


def test_derive_repo_name():
    assert derive_repo_name("https://github.com/tiangolo/fastapi.git") == "tiangolo-fastapi"
    assert derive_repo_name("https://github.com/owner/repo/") == "owner-repo"


class _FakeProc:
    """Stand-in for the git subprocess. finishes=False => never exits (running)."""
    def __init__(self, ret=0, finishes=True):
        self.pid = 999999
        self._ret = ret
        self._finishes = finishes

    def poll(self):
        return self._ret if self._finishes else None

    def wait(self, timeout=None):
        return self._ret


def _tmp_mkdtemp(monkeypatch):
    """Patch mkdtemp to a real temp dir we can assert gets removed."""
    import tempfile
    made = {}
    real = tempfile.mkdtemp
    monkeypatch.setattr(github.tempfile, "mkdtemp",
                        lambda prefix: made.setdefault("dir", real()))
    monkeypatch.setattr(github.time, "sleep", lambda s: None)
    monkeypatch.setattr(github.os, "killpg", lambda *a: None)
    monkeypatch.setattr(github.os, "getpgid", lambda pid: pid)
    return made


def test_clone_rejects_invalid_url_without_subprocess(monkeypatch):
    calls = []
    monkeypatch.setattr(github.subprocess, "Popen", lambda *a, **k: calls.append(a))
    with pytest.raises(ValueError):
        github.clone("https://evil.com/o/r")
    assert calls == []                       # never shelled out for a bad URL


def test_clone_uses_hardened_args_and_minimal_env(monkeypatch, tmp_path):
    monkeypatch.setenv("GEMINI_API_KEY", "super-secret")
    seen = {}

    def fake_popen(args, **kwargs):
        seen["args"], seen["kwargs"] = args, kwargs
        return _FakeProc(ret=0, finishes=True)

    monkeypatch.setattr(github.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(github.tempfile, "mkdtemp", lambda prefix: str(tmp_path / "clone"))
    monkeypatch.setattr(github.time, "sleep", lambda s: None)

    github.clone("https://github.com/owner/repo")
    args = seen["args"]
    assert args[:5] == ["git", "clone", "--depth", "1", "--single-branch"]
    assert args[5] == "--"                                    # option-injection guard
    assert args[6] == "https://github.com/owner/repo"        # url passed as data
    env = seen["kwargs"]["env"]
    assert env["GIT_TERMINAL_PROMPT"] == "0"                  # no auth hang
    assert env["GIT_ALLOW_PROTOCOL"] == "https"              # transport pinned
    assert "GEMINI_API_KEY" not in env                       # server env NOT leaked
    assert seen["kwargs"]["start_new_session"] is True       # kill children on abort


def test_clone_removes_tempdir_on_failure(monkeypatch):
    made = _tmp_mkdtemp(monkeypatch)
    monkeypatch.setattr(github.subprocess, "Popen",
                        lambda *a, **k: _FakeProc(ret=1, finishes=True))
    with pytest.raises(subprocess.CalledProcessError):
        github.clone("https://github.com/owner/repo")
    assert not os.path.exists(made["dir"])                    # cleaned up, no leak


def test_clone_aborts_when_exceeding_size(monkeypatch):
    # DoS guard: a clone that grows past clone_max_bytes is killed + cleaned up
    made = _tmp_mkdtemp(monkeypatch)
    monkeypatch.setattr(github.subprocess, "Popen",
                        lambda *a, **k: _FakeProc(finishes=False))   # never finishes
    monkeypatch.setattr(github, "_dir_size",
                        lambda p: github.settings.clone_max_bytes + 1)
    with pytest.raises(ValueError):
        github.clone("https://github.com/owner/repo")
    assert not os.path.exists(made["dir"])


def test_ingest_source_url_clones_ingests_and_cleans(monkeypatch):
    seen = {}

    def fake_ingest_repo(path, repo):
        seen["ingest"] = (path, repo)
        return IngestResponse(repo=repo, files_indexed=1, chunks_indexed=2)

    monkeypatch.setattr(ingest_mod.github, "clone", lambda url: "/tmp/fake-clone")
    monkeypatch.setattr(ingest_mod, "ingest_repo", fake_ingest_repo)
    monkeypatch.setattr(ingest_mod.shutil, "rmtree",
                        lambda p, ignore_errors=False: seen.setdefault("removed", p))

    res = ingest_mod.ingest_source(url="https://github.com/owner/repo")
    assert seen["ingest"] == ("/tmp/fake-clone", "owner-repo")   # derived name
    assert res.chunks_indexed == 2
    assert seen["removed"] == "/tmp/fake-clone"                  # temp always cleaned


def test_ingest_source_requires_exactly_one_source():
    with pytest.raises(ValueError):
        ingest_mod.ingest_source(path="/x", url="https://github.com/o/r")
    with pytest.raises(ValueError):
        ingest_mod.ingest_source(repo="x")
