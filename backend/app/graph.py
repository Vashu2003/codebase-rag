"""SQLite code-graph sidecar — one file, repo-namespaced.

Nodes are the same chunks stored in Chroma (keyed by the same id). Edges are
name-resolved references: an edge src -> dst (kind='ref') means the chunk `src`
references a symbol that the chunk `dst` defines. Used at query time to expand
vector hits along the call/reference structure of the code.

sqlite3 is stdlib, so this adds no dependency. Lazy connection so importing the
module does no IO (mirrors store.py).
"""
from __future__ import annotations

import os
import sqlite3
import threading

from .config import settings

_conn: sqlite3.Connection | None = None
# one process-wide lock: writes happen in /ingest and reads in /query, both of
# which FastAPI runs in the threadpool, so they can hit the shared connection
# concurrently. Serializing is fine for a single-user tool and avoids
# 'database is locked' / interleaved-transaction corruption.
_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        os.makedirs(settings.graph_dir, exist_ok=True)
        _conn = sqlite3.connect(
            os.path.join(settings.graph_dir, "graph.db"),
            check_same_thread=False,
        )
        _conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS nodes (
                repo TEXT, id TEXT, file TEXT,
                start_line INTEGER, end_line INTEGER, symbol TEXT,
                PRIMARY KEY (repo, id)
            );
            CREATE TABLE IF NOT EXISTS edges (
                repo TEXT, src TEXT, dst TEXT, kind TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(repo, src);
            CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(repo, dst);
            """
        )
        _conn.commit()
    return _conn


def reset(repo: str) -> None:
    with _lock:
        conn = _get_conn()
        conn.execute("DELETE FROM nodes WHERE repo = ?", (repo,))
        conn.execute("DELETE FROM edges WHERE repo = ?", (repo,))
        conn.commit()


def add_nodes(repo: str, rows: list[dict]) -> None:
    if not rows:
        return
    with _lock:
        conn = _get_conn()
        conn.executemany(
            "INSERT OR REPLACE INTO nodes (repo, id, file, start_line, end_line, symbol)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            [(repo, r["id"], r["file"], r["start_line"], r["end_line"], r["symbol"])
             for r in rows],
        )
        conn.commit()


def add_edges(repo: str, edges: list[tuple[str, str]], kind: str = "ref") -> None:
    if not edges:
        return
    with _lock:
        conn = _get_conn()
        conn.executemany(
            "INSERT INTO edges (repo, src, dst, kind) VALUES (?, ?, ?, ?)",
            [(repo, src, dst, kind) for src, dst in edges],
        )
        conn.commit()


def neighbors(repo: str, ids: list[str], out_cap: int, in_cap: int) -> list[dict]:
    """Return node rows 1 hop from `ids`: callees/definitions (src->dst, capped
    per seed) and callers (dst->src, capped per seed). Excludes the seeds
    themselves. Safe (returns []) when no graph exists for the repo.
    """
    if not ids:
        return []
    seeds = set(ids)
    found: dict[str, dict] = {}

    def pull(conn, sql: str, cap: int, direction: str):
        # ids are in seed-rank order (strongest first); first seed to reach a
        # neighbor wins its `via`, so neighbors inherit their best seed's score.
        for seed in ids:
            for nid, file, s, e, sym in conn.execute(sql, (repo, seed, cap)):
                if nid in seeds or nid in found:
                    continue
                found[nid] = {
                    "id": nid, "file": file, "start_line": s, "end_line": e,
                    "symbol": sym, "edge": direction, "via": seed,
                }

    with _lock:
        conn = _get_conn()
        # callees: symbols this seed references (seed --src--> dst)
        pull(
            conn,
            "SELECT n.id, n.file, n.start_line, n.end_line, n.symbol "
            "FROM edges e JOIN nodes n ON n.repo = e.repo AND n.id = e.dst "
            "WHERE e.repo = ? AND e.src = ? ORDER BY n.id LIMIT ?",
            out_cap, "callee",
        )
        # callers: chunks that reference this seed (src --dst--> seed)
        pull(
            conn,
            "SELECT n.id, n.file, n.start_line, n.end_line, n.symbol "
            "FROM edges e JOIN nodes n ON n.repo = e.repo AND n.id = e.src "
            "WHERE e.repo = ? AND e.dst = ? ORDER BY n.id LIMIT ?",
            in_cap, "caller",
        )
    return list(found.values())
