import re

import pytest

from app.store import _safe

CHROMA_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$")


@pytest.mark.parametrize(
    "repo",
    [
        "fastapi",
        "my repo!",
        "../etc/passwd",
        "a..b",            # would be consecutive periods if naively kept
        "...",             # all-illegal
        "",                # empty
        "UPPER_Case",
        "a" * 200,         # over length
        "trailing---",
    ],
)
def test_safe_names_are_valid_chroma_collections(repo):
    name = _safe(repo)
    assert 3 <= len(name) <= 63
    assert CHROMA_NAME.match(name), name
    assert ".." not in name          # chroma rejects consecutive periods
    assert name.startswith("repo-") or name == "repo"


def test_safe_is_deterministic():
    assert _safe("Some Repo") == _safe("Some Repo")


def test_distinct_repos_get_distinct_collections():
    assert _safe("alpha") != _safe("beta")


@pytest.mark.parametrize(
    "a,b",
    [
        ("my repo", "my_repo"),
        ("my-repo", "my/repo"),
        ("My Repo", "my.repo"),
        ("a" * 60, "a" * 61),   # long names sharing a truncated prefix
    ],
)
def test_similar_names_do_not_collide(a, b):
    # names that slugify identically must still map to different collections,
    # otherwise one repo's ingest would overwrite another's index
    assert _safe(a) != _safe(b)
