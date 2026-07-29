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
# so a cascade aggregates free-tier capacity. Both are reliable + fast from Render
# (with thinking disabled, see below) and accept thinkingBudget=0:
#   gemini-2.5-flash      — 20 RPD  (lead: quality)
#   gemini-3.1-flash-lite — 500 RPD (workhorse: high daily cap, absorbs load)
# ≈520 RPD total. gemini-3.5-flash was DROPPED — it network-errors / ReadTimeouts /
# "high demand" from Render in every observation; re-add via CHAT_GEMINI_MODELS if
# it recovers. Pinned (not the `*-latest` alias) so RPD is predictable.
_DEFAULT_MODELS = "gemini-2.5-flash,gemini-3.1-flash-lite"
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
    """Raised when the LLM is unconfigured or all fallback models fail.

    ``kind`` distinguishes failures the user can do something about from ones
    they cannot:

      ``"transient"``  — throttling, timeouts, a model having a bad minute.
                         Retrying genuinely might work.
      ``"config"``     — the API key is missing, rejected (401) or forbidden
                         (403). No amount of retrying will help; a human has to
                         fix the deployment.

    This distinction exists because it was collapsed once already, with real
    consequences: a dead Gemini key returned 401 on every call, the UI told
    everyone "the assistant is busy, try again shortly", and the chat stayed
    broken in production unnoticed because that message looks like normal load.
    """

    def __init__(self, message: str, kind: str = "transient"):
        super().__init__(message)
        self.kind = kind

    @property
    def is_config_error(self) -> bool:
        return self.kind == "config"


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
        raise LLMError("CHAT_GEMINI_API_KEY not configured", kind="config")

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
            # Disable "thinking": on 2.5/3.x flash, thinking tokens count against
            # maxOutputTokens, so the visible answer gets truncated mid-sentence
            # (finishReason MAX_TOKENS) and latency balloons ~5-15 s. We want a
            # direct answer, not chain-of-thought. (2.5-flash & 3.1-flash-lite both
            # accept thinkingBudget=0 and then return complete answers in ~3 s.)
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    if system_prompt:
        payload["system_instruction"] = {"parts": [{"text": system_prompt}]}

    last_err = None
    # Sticky across the model cascade: a rejected credential fails identically for
    # every model, so one 401 anywhere means the key is the problem.
    auth_failed = False
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
            # Key goes in a header, never the query string: URLs end up in access
            # logs, exception messages and error reports, and a leaked key there
            # is a leaked key everywhere.
            url = f"{GEMINI_API_BASE}/{model}:generateContent"
            try:
                resp = await client.post(
                    url,
                    json=payload,
                    headers={"x-goog-api-key": key},
                    timeout=attempt_timeout,
                )
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
            # 401/403 is the credential itself being rejected, which is identical
            # for every model in the cascade — worth its own loud log line, since
            # it means the deployment is broken rather than merely busy.
            if resp.status_code in (401, 403):
                auth_failed = True
                logger.error(
                    "Gemini %s HTTP %s — API KEY REJECTED (check CHAT_GEMINI_API_KEY): %s",
                    model, resp.status_code, resp.text[:200],
                )
            else:
                logger.warning(f"Gemini {model} HTTP {resp.status_code}: {resp.text[:200]}")

    if auth_failed:
        raise LLMError(f"Gemini rejected the API key: {last_err}", kind="config")
    raise LLMError(f"all Gemini models failed: {last_err}", kind="transient")
