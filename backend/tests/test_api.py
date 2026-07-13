from app import rag
from app.models import Citation, QueryResponse


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "llm_provider" in body


def test_ingest_bad_path_returns_400(client):
    r = client.post("/ingest", json={"path": "/no/such/dir-xyz", "repo": "x"})
    assert r.status_code == 400


def test_ingest_disallowed_url_host_returns_400(client):
    r = client.post("/ingest", json={"url": "https://evil.com/o/r"})
    assert r.status_code == 400          # validated before any network call


def test_ingest_no_source_returns_400(client):
    r = client.post("/ingest", json={"repo": "x"})
    assert r.status_code == 400          # neither path nor url


def test_query_happy_path(client, monkeypatch):
    async def fake_answer(repo, question, top_k):
        return QueryResponse(
            answer="here [1]",
            citations=[Citation(
                repo=repo, file="calc.py", start_line=1, end_line=5,
                symbol="add", score=0.9,
            )],
        )

    monkeypatch.setattr(rag, "answer", fake_answer)
    r = client.post("/query", json={"repo": "r", "question": "where is add?"})
    assert r.status_code == 200
    body = r.json()
    assert body["answer"] == "here [1]"
    assert body["citations"][0]["file"] == "calc.py"


def test_query_rejects_out_of_range_top_k(client):
    r = client.post(
        "/query", json={"repo": "r", "question": "q", "top_k": 10_000_000}
    )
    assert r.status_code == 422


def test_query_error_is_sanitized(client, monkeypatch):
    async def boom(repo, question, top_k):
        raise RuntimeError("SENSITIVE-INTERNAL-LEAK-abc123")

    monkeypatch.setattr(rag, "answer", boom)
    r = client.post("/query", json={"repo": "r", "question": "q"})
    assert r.status_code == 500
    # raw internal error text must never reach the client
    assert "SENSITIVE-INTERNAL-LEAK" not in r.text
