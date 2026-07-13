"""Clone a repo from a git URL for ingestion.

Cloning an attacker-supplied URL is the sensitive part; the guards here:
  * HTTPS only + host allowlist (default github.com) — no ssh://, file://,
    git://, no arbitrary hosts (limits SSRF / local-file reads).
  * list-form subprocess, never a shell — no command injection.
  * `--` before the URL and a leading-dash reject — no git option injection
    (e.g. a URL like `--upload-pack=...`).
  * no credential prompts (GIT_TERMINAL_PROMPT=0) — private/auth repos fail
    fast instead of hanging.
  * shallow single-branch clone + a timeout — bounds time/bandwidth; the
    ingest file/byte caps bound what's actually read.
"""
from __future__ import annotations

import os
import re
import shutil
import signal
import subprocess
import tempfile
import time

from .config import settings

# https://host/owner/repo  (optional .git, optional trailing slash)
_URL_RE = re.compile(r"^https://([a-zA-Z0-9.\-]+)/[A-Za-z0-9._\-]+/[A-Za-z0-9._\-]+?(\.git)?/?$")


def _allowed_hosts() -> set[str]:
    return {h.strip().lower() for h in settings.git_allowed_hosts.split(",") if h.strip()}


def validate_url(url: str) -> str:
    if not isinstance(url, str) or url.startswith("-"):
        raise ValueError("invalid git URL")
    m = _URL_RE.match(url.strip())
    if not m:
        raise ValueError("only https://host/owner/repo URLs are allowed")
    host = m.group(1).lower()
    if host not in _allowed_hosts():
        raise ValueError(f"host not allowed: {host} (allowed: {settings.git_allowed_hosts})")
    return url.strip()


def derive_repo_name(url: str) -> str:
    parts = url.strip().rstrip("/").removesuffix(".git").split("/")
    return "-".join(parts[-2:]) if len(parts) >= 2 else parts[-1]


# minimal, allowlisted env — do NOT hand the whole server environment (which
# holds GEMINI_API_KEY etc.) to the git child. GIT_ALLOW_PROTOCOL pins https as
# defense-in-depth if the URL regex is ever loosened; NOSYSTEM ignores any
# machine-wide gitconfig (insteadOf rewrites, credential helpers).
def _git_env() -> dict:
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("HOME", "/tmp"),
        "GIT_TERMINAL_PROMPT": "0",     # never prompt for credentials
        "GIT_ASKPASS": "true",          # ...and fail fast if one is needed
        "GIT_ALLOW_PROTOCOL": "https",  # transport lock
        "GIT_CONFIG_NOSYSTEM": "1",
    }


def _dir_size(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _kill_group(proc: subprocess.Popen) -> None:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        proc.kill()
    try:
        proc.wait(timeout=5)
    except Exception:
        pass


def clone(url: str) -> str:
    """Validate + shallow-clone `url` into a fresh temp dir; return its path.
    Aborts (and cleans up) if the clone exceeds clone_timeout OR clone_max_bytes
    on disk — the latter bounds a malicious repo, since the ingest byte caps
    only apply AFTER the clone. Caller owns the returned dir."""
    url = validate_url(url)
    tmp = tempfile.mkdtemp(prefix="cbr-clone-")
    # start_new_session so a timeout/size-abort kills git AND its children
    # (git-remote-https / index-pack), not just the parent.
    proc = subprocess.Popen(
        ["git", "clone", "--depth", "1", "--single-branch", "--", url, tmp],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True, env=_git_env(),
    )
    start = time.monotonic()
    try:
        while True:
            ret = proc.poll()
            if ret is not None:
                if ret != 0:
                    raise subprocess.CalledProcessError(ret, "git clone")
                return tmp
            if time.monotonic() - start > settings.clone_timeout:
                raise TimeoutError("clone timed out")
            if _dir_size(tmp) > settings.clone_max_bytes:
                raise ValueError(
                    f"clone exceeds clone_max_bytes ({settings.clone_max_bytes})"
                )
            time.sleep(0.5)
    except BaseException:
        _kill_group(proc)
        shutil.rmtree(tmp, ignore_errors=True)
        raise
