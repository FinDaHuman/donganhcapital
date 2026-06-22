"""Gemini LLM client for the AI chat + news-analysis features.

Calls Gemini's REST ``generateContent`` endpoint via ``httpx`` (async-native,
already a backend dependency — no new package, no ``to_thread`` needed) with a
model-fallback loop adapted from ``facebook_bot/llm_generator.py``.

Reads ``CHAT_GEMINI_API_KEY`` — a DEDICATED key, separate from the Facebook bot's
shared ``GEMINI_API_KEY`` (which is already 429-throttled). A total failure raises
``LLMError``; callers map it to HTTP 503 (never 500) so the rest of the API keeps
working when Gemini is down or throttled. A short timeout keeps a hung call from
pinning a chat-semaphore slot on the 0.1 vCPU box.
"""

import os
import time
import logging

import httpx

logger = logging.getLogger(__name__)

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# Fast/cheap first, then progressively broader fallbacks — all flash-class to stay
# within the free tier; on any error we advance to the next model immediately
# (no 30 s retry sleep like the FB bot — this call is on a user's request path).
# Overridable via CHAT_GEMINI_MODELS (comma-separated) so a retired model can be
# swapped without a code change. Each model has its OWN daily-request (RPD) bucket,
# so a cascade aggregates free-tier capacity. Order = production-reliable flagship
# first, newer flagship as reserve, then a high-capacity lite workhorse:
#   gemini-2.5-flash      — 20 RPD  (lead: proven reliable from Render)
#   gemini-3.5-flash      — 20 RPD  (reserve: newer, but has been network-erroring
#                                     / "high demand" from Render — kept as fallback)
#   gemini-3.1-flash-lite — 500 RPD (absorbs sustained load after the above 429)
# ≈540 RPD total. Pinned (not the `*-latest` alias) so RPD is predictable.
_DEFAULT_MODELS = "gemini-2.5-flash,gemini-3.5-flash,gemini-3.1-flash-lite"
# Three-level timeout so the cascade stays well under the frontend's request
# timeout (and can't pin both Semaphore(2) slots): a fast CONNECT_TIMEOUT fails an
# unreachable model quickly (the common failure here), PER_ATTEMPT_TIMEOUT bounds a
# single generation, and OVERALL_DEADLINE caps the whole generate() call.
CONNECT_TIMEOUT = 5.0       # seconds to establish the connection (fail-fast on hangs)
PER_ATTEMPT_TIMEOUT = 12.0  # seconds to read a single model's full response
OVERALL_DEADLINE = 20.0     # seconds across all fallback attempts combined


def _models() -> list[str]:
    raw = os.getenv("CHAT_GEMINI_MODELS", _DEFAULT_MODELS)
    return [m.strip() for m in raw.split(",") if m.strip()] or [_DEFAULT_MODELS.split(",")[0]]


class LLMError(Exception):
    """Raised when the LLM is unconfigured or all fallback models fail."""


def is_configured() -> bool:
    return bool(os.getenv("CHAT_GEMINI_API_KEY"))


def _extract_text(data: dict):
    try:
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        parts = candidates[0].get("content", {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts).strip()
        return text or None
    except Exception:
        return None


async def generate(
    system_prompt: str,
    messages: list[dict],
    *,
    temperature: float = 0.5,
    max_output_tokens: int = 1024,
) -> str:
    """Generate a reply from Gemini.

    ``messages`` is a list of ``{"role": "user"|"assistant", "content": str}``;
    "assistant" is mapped to Gemini's "model" role. Returns the response text.
    Raises ``LLMError`` if the key is missing or every fallback model fails.
    """
    key = os.getenv("CHAT_GEMINI_API_KEY")
    if not key:
        raise LLMError("CHAT_GEMINI_API_KEY not configured")

    contents = []
    for m in messages:
        role = "model" if m.get("role") == "assistant" else "user"
        text = (m.get("content") or "").strip()
        if not text:
            continue
        contents.append({"role": role, "parts": [{"text": text}]})
    # Gemini requires the conversation to begin with a user turn.
    while contents and contents[0]["role"] == "model":
        contents.pop(0)
    if not contents:
        raise LLMError("empty conversation")

    payload: dict = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
        },
    }
    if system_prompt:
        payload["system_instruction"] = {"parts": [{"text": system_prompt}]}

    last_err = None
    deadline = time.monotonic() + OVERALL_DEADLINE
    async with httpx.AsyncClient() as client:
        for model in _models():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                last_err = RuntimeError("overall deadline exceeded")
                logger.warning("Gemini overall deadline exceeded; giving up")
                break
            attempt_read = min(PER_ATTEMPT_TIMEOUT, remaining)
            attempt_timeout = httpx.Timeout(attempt_read, connect=min(CONNECT_TIMEOUT, attempt_read))
            url = f"{GEMINI_API_BASE}/{model}:generateContent?key={key}"
            try:
                resp = await client.post(url, json=payload, timeout=attempt_timeout)
            except httpx.HTTPError as e:
                last_err = e
                # str(e) is often empty for timeouts — log the type so it's diagnosable.
                logger.warning(f"Gemini {model} network error: {type(e).__name__}: {e}")
                continue

            if resp.status_code == 200:
                try:
                    text = _extract_text(resp.json())
                except Exception as e:
                    last_err = e
                    logger.warning(f"Gemini {model} unparseable 200 body: {e}")
                    continue
                if text:
                    return text
                last_err = RuntimeError(f"{model} returned no usable text")
                logger.warning(f"Gemini {model} empty/blocked response")
                continue

            # 429 (quota) or 5xx (server) or 4xx (bad model) → advance to next model.
            last_err = RuntimeError(f"{model} HTTP {resp.status_code}")
            logger.warning(f"Gemini {model} HTTP {resp.status_code}: {resp.text[:200]}")

    raise LLMError(f"all Gemini models failed: {last_err}")
