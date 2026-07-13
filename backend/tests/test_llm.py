import httpx
import pytest
import respx

from app import llm as llm_mod
from app.config import settings


async def test_gemini_missing_key_raises(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    with pytest.raises(RuntimeError):
        await llm_mod._gemini("hi")


@respx.mock
async def test_complete_routes_to_ollama(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "ollama")
    route = respx.post(f"{settings.ollama_host}/api/generate").mock(
        return_value=httpx.Response(200, json={"response": "  ollama says hi  "})
    )
    out = await llm_mod.complete("prompt")
    assert out == "ollama says hi"
    assert route.called


@respx.mock
async def test_complete_retries_transient_then_succeeds(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "ollama")
    monkeypatch.setattr(llm_mod, "_RETRY_BASE_DELAY", 0)  # no real sleeping
    route = respx.post(f"{settings.ollama_host}/api/generate").mock(
        side_effect=[
            httpx.Response(503),                              # transient
            httpx.Response(200, json={"response": "recovered"}),
        ]
    )
    out = await llm_mod.complete("prompt")
    assert out == "recovered"
    assert route.call_count == 2


@respx.mock
async def test_complete_routes_to_gemini(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    route = respx.post(url).mock(
        return_value=httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "gemini answer"}]}}]},
        )
    )
    out = await llm_mod.complete("prompt")
    assert out == "gemini answer"
    assert route.called


@respx.mock
async def test_gemini_empty_candidates_raises(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "k")
    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    ).mock(return_value=httpx.Response(200, json={"promptFeedback": {}}))
    with pytest.raises(RuntimeError):
        await llm_mod._gemini("blocked prompt")


@respx.mock
async def test_gemini_key_not_in_request_body(monkeypatch):
    """Key travels as a query param, never in the JSON body we log/send around."""
    monkeypatch.setattr(settings, "gemini_api_key", "secret-123")
    monkeypatch.setattr(settings, "gemini_model", "gemini-2.0-flash")
    captured = {}

    def responder(request):
        captured["content"] = request.content.decode()
        return httpx.Response(
            200, json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}
        )

    respx.post(
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.0-flash:generateContent"
    ).mock(side_effect=responder)

    await llm_mod._gemini("prompt")
    assert "secret-123" not in captured["content"]
