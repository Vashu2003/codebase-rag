import pytest

from app import reranker
from app.rag import Cand


def _c(text, score=0.1):
    return Cand(id=text, text=text, file="f.py", start_line=1, end_line=1,
                symbol="", score=score, source="seed")


def test_rerank_rescores_and_reorders(monkeypatch):
    class Fake:
        # predict() is asked for raw logits (activation_fct=Identity), so
        # returning logits here matches the real contract
        def predict(self, pairs, activation_fct=None):
            return [5.0 if "BEST" in t else -5.0 for _q, t in pairs]

    monkeypatch.setattr(reranker, "_model", lambda: Fake())
    high_vec = _c("topically similar but off", score=0.95)
    low_vec = _c("the BEST answer", score=0.05)
    out = reranker.rerank("q", [high_vec, low_vec])
    assert out[0].text == "the BEST answer"          # promoted above the high vector score
    assert out[0].score > out[1].score
    assert out[0].score > 0.9 and out[1].score < 0.1  # well-spread, not squashed
    assert all(0.0 <= c.score <= 1.0 for c in out)


def test_rerank_empty_is_noop():
    assert reranker.rerank("q", []) == []


def test_sigmoid_bounds():
    assert reranker._sigmoid(-1000) == 0.0
    assert reranker._sigmoid(1000) == 1.0
    assert 0.45 < reranker._sigmoid(0.0) < 0.55


@pytest.mark.slow
def test_real_reranker_scores_are_well_spread():
    # real bge-reranker: a relevant pair must score well above an irrelevant one
    # and NOT collapse into a narrow band (guards the double-sigmoid regression)
    good = _c("def add(a, b):\n    return a + b")
    bad = _c("class HttpServer:\n    def listen(self, port):\n        ...")
    out = reranker.rerank("how do I add two numbers together", [good, bad])
    assert out[0].text.startswith("def add")
    assert out[0].score - out[1].score > 0.2
