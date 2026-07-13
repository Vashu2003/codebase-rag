"""Pluggable answer LLM: local Ollama or Gemini free tier.

Both are free. Ollama runs fully offline; Gemini's free tier gives
near-frontier quality without a GPU. Switch with LLM_PROVIDER in .env.
"""
from __future__ import annotations

import asyncio

import httpx

from .config import settings

# transient provider errors worth retrying (rate limit / overloaded / gateway)
_RETRY_STATUS = {429, 500, 502, 503, 504}
_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 1.0  # seconds; grows exponentially. Patched to 0 in tests.


async def _with_retry(call):
    delay = _RETRY_BASE_DELAY
    for attempt in range(_MAX_RETRIES):
        try:
            return await call()
        except httpx.HTTPStatusError as e:
            transient = e.response.status_code in _RETRY_STATUS
            if transient and attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(delay)
                delay *= 2
                continue
            raise


async def _ollama(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{settings.ollama_host}/api/generate",
            json={"model": settings.ollama_model, "prompt": prompt, "stream": False},
        )
        r.raise_for_status()
        return (r.json().get("response") or "").strip()


async def _gemini(prompt: str) -> str:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is empty; set it or use LLM_PROVIDER=ollama")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    async with httpx.AsyncClient(timeout=120) as client:
        # key in a header, never the URL/body — so it can't leak via an
        # httpx error message, access log, or exception traceback.
        r = await client.post(
            url,
            headers={"x-goog-api-key": settings.gemini_api_key},
            json={"contents": [{"parts": [{"text": prompt}]}]},
        )
        r.raise_for_status()
        data = r.json()
        candidates = data.get("candidates") or []
        if not candidates:
            # e.g. safety-blocked prompt returns promptFeedback but no candidates
            raise RuntimeError("Gemini returned no answer (possibly safety-blocked)")
        parts = candidates[0].get("content", {}).get("parts", [])
        return "".join(p.get("text", "") for p in parts).strip()


async def complete(prompt: str) -> str:
    provider = _gemini if settings.llm_provider == "gemini" else _ollama
    return await _with_retry(lambda: provider(prompt))
