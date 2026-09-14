"""Copilot LLM provider chain.

Resolution order (first available wins):
  1. OpenAI-compatible HTTP endpoint when LLM_BASE_URL + LLM_API_KEY are set.
  2. The `z-ai` CLI subprocess (`z-ai chat -p … -s … -o tmp.json`) when the
     binary exists in PATH — its JSON output is OpenAI-compatible
     ({choices[0].message.content}).
  3. None → the caller falls back to the deterministic rule-based engine.

Every provider has a hard 25s timeout and honest error propagation: the
caller receives `None` on any failure and labels the answer accordingly.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import tempfile
from typing import Any

import httpx

from .config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT_S

log = logging.getLogger("llm")


async def _via_openai_compatible(messages: list[dict[str, str]]) -> str | None:
    url = f"{LLM_BASE_URL}/chat/completions"
    headers = {"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": LLM_MODEL, "messages": messages}
    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_S) as client:
        res = await client.post(url, json=payload, headers=headers)
        res.raise_for_status()
        body = res.json()
    content = ((body.get("choices") or [{}])[0].get("message") or {}).get("content")
    return content.strip() if content and content.strip() else None


async def _via_zai_cli(messages: list[dict[str, str]]) -> str | None:
    """`z-ai chat -p <prompt> -s <system> -o <tmpfile>` → parse JSON file."""
    system = "\n".join(m["content"] for m in messages if m["role"] == "system")
    user = messages[-1]["content"]
    # Collapse short history into the user turn for the single-shot CLI.
    history_tail = [m for m in messages[1:-1] if m["role"] in ("user", "assistant")]
    if history_tail:
        transcript = "\n".join(f"{'Operator' if m['role'] == 'user' else 'Copilot'}: {m['content']}" for m in history_tail)
        user = f"{transcript}\nOperator: {user}"

    fd, path = tempfile.mkstemp(suffix=".json", prefix="zai-")
    os.close(fd)
    try:
        proc = await asyncio.create_subprocess_exec(
            "z-ai", "chat", "-p", user, "-s", system, "-o", path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(proc.wait(), timeout=LLM_TIMEOUT_S)
        except asyncio.TimeoutError:
            proc.kill()
            raise TimeoutError("z-ai CLI timed out") from None
        with open(path, encoding="utf-8") as fh:
            body = json.load(fh)
        content = ((body.get("choices") or [{}])[0].get("message") or {}).get("content")
        return content.strip() if content and content.strip() else None
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def complete(messages: list[dict[str, str]]) -> str | None:
    """Run the provider chain. Returns reply text or None (caller falls back)."""
    if LLM_BASE_URL and LLM_API_KEY:
        try:
            return await _via_openai_compatible(messages)
        except Exception as exc:  # noqa: BLE001 — honest degradation to next provider
            log.warning("[llm] OpenAI-compatible provider failed: %s", exc)
    if shutil.which("z-ai"):
        try:
            return await _via_zai_cli(messages)
        except Exception as exc:  # noqa: BLE001 — honest degradation to fallback
            log.warning("[llm] z-ai CLI provider failed: %s", exc)
    return None


__all__ = ["complete"]
