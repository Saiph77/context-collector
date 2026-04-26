#!/usr/bin/env python3
"""
Agent Kernel HTTP Server
Provides SSE streaming endpoints for:
- /agent/stream (Anthropic text agent)
- /vision/stream (LongCat multimodal chat)
- /vision/transcript (LongCat multimodal transcript with phase updates)
"""

import base64
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterator

from anthropic import Anthropic
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from openai import OpenAI

# Load environment variables from .env file (doesn't override existing env vars)
SCRIPT_DIR = Path(__file__).parent
load_dotenv(SCRIPT_DIR / ".env", override=False)

# Initialize Anthropic client
api_key = os.getenv("ANTHROPIC_API_KEY")
auth_token = os.getenv("ANTHROPIC_AUTH_TOKEN")
base_url = os.getenv("ANTHROPIC_BASE_URL")
custom_headers_str = os.getenv("ANTHROPIC_CUSTOM_HEADERS")

# Use auth token if available, otherwise use API key
effective_key = auth_token if auth_token else api_key

if not effective_key:
    print("Error: Neither ANTHROPIC_API_KEY nor ANTHROPIC_AUTH_TOKEN found", file=sys.stderr)
    sys.exit(1)

# Build custom headers
custom_headers: dict[str, str] = {}
if custom_headers_str:
    # Support both comma-separated and newline-separated formats
    for pair in custom_headers_str.replace("\n", ",").split(","):
        pair = pair.strip()
        if ":" in pair:
            k, v = pair.split(":", 1)
            custom_headers[k.strip()] = v.strip()

if base_url:
    # For third-party providers or internal proxies
    client = Anthropic(
        api_key=effective_key,
        base_url=base_url,
        default_headers={
            "Authorization": f"Bearer {effective_key}",
            **custom_headers,
        },
    )
else:
    # For official Anthropic API
    client = Anthropic(api_key=effective_key)

MODEL = os.getenv("MODEL_ID", "claude-sonnet-4-6")

# Initialize LongCat vision client (optional)
LONGCAT_API_KEY = os.getenv("LONGCAT_API_KEY")
LONGCAT_BASE_URL = os.getenv("LONGCAT_BASE_URL", "https://api.longcat.chat/openai")
LONGCAT_MODEL = os.getenv("LONGCAT_MODEL", "LongCat-Flash-Omni-2603")

vision_client: OpenAI | None = None
if LONGCAT_API_KEY:
    vision_client = OpenAI(api_key=LONGCAT_API_KEY, base_url=LONGCAT_BASE_URL)
else:
    print("Warning: LONGCAT_API_KEY not set, /vision/* endpoints will return errors.", file=sys.stderr)

# Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for Electron renderer


def sse_json(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def stream_agent_response(user_message: str, context_files: list[dict[str, Any]]) -> Iterator[str]:
    """
    Stream Claude agent response using SSE format.

    Yields:
        SSE-formatted chunks: "data: {json}\n\n"
    """
    # Build system prompt with context
    system_parts = [
        "You are a helpful coding assistant integrated into Context Collector app.",
        "The user may attach file previews as context. Use them to provide accurate answers.",
    ]

    if context_files:
        system_parts.append("\n--- Attached Context Files ---")
        for item in context_files:
            system_parts.append(f"\nFile: {item['path']}")
            system_parts.append(f"```{item.get('previewKind', 'text')}")
            system_parts.append(item["content"])
            system_parts.append("```")

    system_prompt = "\n".join(system_parts)

    messages = [{"role": "user", "content": user_message}]

    try:
        # Stream response from Claude
        with client.messages.stream(
            model=MODEL,
            system=system_prompt,
            messages=messages,
            max_tokens=4096,
        ) as stream:
            for text in stream.text_stream:
                yield sse_json({"type": "chunk", "content": text})

        # Send completion signal
        yield sse_json({"type": "done", "timestamp": None})

    except Exception as exc:  # pragma: no cover - network dependent
        import traceback

        error_details = traceback.format_exc()
        print(f"Stream error: {error_details}", file=sys.stderr)
        yield sse_json({"type": "error", "message": str(exc)})


def build_longcat_messages(
    prompt: str,
    attachments: list[dict[str, Any]],
    history: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    multimodal_content_blocks: list[dict[str, Any]] = []
    file_descriptions: list[str] = []

    for index, attachment in enumerate(attachments, start=1):
        name = str(attachment.get("name") or f"attachment-{index}")
        mime = str(attachment.get("mimeType") or "application/octet-stream")
        data = str(attachment.get("base64") or "")
        kind = str(attachment.get("kind") or "file")

        if not data:
            file_descriptions.append(f"[{index}] {name}: empty payload")
            continue

        if kind == "image" or mime.startswith("image/"):
            multimodal_content_blocks.append(
                {
                    "type": "input_image",
                    "input_image": {
                        "type": "base64",
                        # LongCat multimodal requires an array payload for base64 images.
                        "data": [data],
                    },
                }
            )
            file_descriptions.append(f"[{index}] image: {name} ({mime})")
            continue

        if mime in {"text/plain", "text/markdown", "application/json"}:
            decoded_text: str | None = None
            try:
                decoded_text = base64.b64decode(data).decode("utf-8", errors="replace")
            except Exception:
                decoded_text = None

            if decoded_text is not None:
                file_descriptions.append(
                    f"[{index}] text file: {name} ({mime})\\n{decoded_text[:12000]}"
                )
            continue

        if mime == "application/pdf":
            # Best-effort multimodal file input for providers that support input_file.
            multimodal_content_blocks.append(
                {
                    "type": "input_file",
                    "input_file": {
                        "type": "base64",
                        "filename": name,
                        "media_type": mime,
                        "data": data,
                    },
                }
            )
            file_descriptions.append(f"[{index}] pdf file: {name}")
            continue

        file_descriptions.append(f"[{index}] unsupported typed file: {name} ({mime})")

    prompt_parts = [prompt.strip()]
    if file_descriptions:
        prompt_parts.append("\n\nAttached file summary:\n" + "\n\n".join(file_descriptions))

    # Keep the same order as LongCat multi-image examples: text first, then images/files.
    content: list[dict[str, Any]] = [
        {"type": "text", "text": "\n".join(part for part in prompt_parts if part)}
    ]
    content.extend(multimodal_content_blocks)

    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": [
                {
                    "type": "text",
                    "text": "你是一个谨慎的多模态助手。请基于用户提供的图片与文件内容准确回答。",
                }
            ],
        }
    ]

    for item in history:
        role = str(item.get("role") or "user")
        if role not in {"user", "assistant"}:
            continue
        text = str(item.get("content") or "").strip()
        if not text:
            continue
        messages.append(
            {
                "role": role,
                "content": [{"type": "text", "text": text}],
            }
        )

    messages.append({"role": "user", "content": content})
    return messages


def stream_longcat_response(
    *,
    prompt: str,
    attachments: list[dict[str, Any]],
    history: list[dict[str, Any]],
    include_phase: bool,
) -> Iterator[str]:
    if vision_client is None:
        yield sse_json({"type": "error", "message": "LONGCAT_API_KEY is not configured."})
        return

    try:
        if include_phase:
            yield sse_json({"type": "phase", "phase": "uploading"})
            yield sse_json({"type": "phase", "phase": "parsing"})

        messages = build_longcat_messages(prompt, attachments, history)

        stream = vision_client.chat.completions.create(
            model=LONGCAT_MODEL,
            messages=messages,
            max_tokens=4096,
            temperature=0.2,
            stream=True,
            extra_body={"output_modalities": ["text"]},
        )

        if include_phase:
            yield sse_json({"type": "phase", "phase": "streaming"})

        for chunk in stream:
            choice = chunk.choices[0] if chunk.choices else None
            delta = getattr(choice, "delta", None)
            text = extract_delta_text(delta)

            if text:
                yield sse_json({"type": "chunk", "content": text})

        yield sse_json({"type": "done", "timestamp": None})

    except Exception as exc:  # pragma: no cover - network dependent
        import traceback

        error_details = traceback.format_exc()
        print(f"Vision stream error: {error_details}", file=sys.stderr)
        yield sse_json({"type": "error", "message": str(exc)})


def extract_delta_text(delta: Any) -> str:
    if delta is None:
        return ""

    content = getattr(delta, "content", "")
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    chunks.append(text)
                continue

            text = getattr(item, "text", None)
            if isinstance(text, str):
                chunks.append(text)

        return "".join(chunks)

    text = getattr(delta, "text", None)
    if isinstance(text, str):
        return text

    return ""


@app.route("/health", methods=["GET"])
def health() -> Response:
    """Health check endpoint."""
    return jsonify(
        {
            "status": "ok",
            "model": MODEL,
            "vision_model": LONGCAT_MODEL,
            "vision_ready": vision_client is not None,
        }
    )


@app.route("/agent/stream", methods=["POST"])
def agent_stream() -> Response:
    """
    SSE streaming endpoint for agent responses.

    Request body:
        {
            "message": "user message",
            "contextFiles": [
                {
                    "path": "/path/to/file.md",
                    "content": "file content",
                    "previewKind": "markdown"
                }
            ]
        }

    Response:
        SSE stream with chunks:
        - {"type": "chunk", "content": "text"}
        - {"type": "done", "timestamp": null}
        - {"type": "error", "message": "error message"}
    """
    data = request.get_json() or {}

    if "message" not in data:
        return jsonify({"error": "Missing 'message' field"}), 400

    user_message = str(data["message"])
    context_files = data.get("contextFiles", [])

    return Response(
        stream_agent_response(user_message, context_files),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@app.route("/vision/stream", methods=["POST"])
def vision_stream() -> Response:
    data = request.get_json() or {}

    message = str(data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Missing 'message' field"}), 400

    attachments_raw = data.get("attachments", [])
    attachments = attachments_raw if isinstance(attachments_raw, list) else [attachments_raw]
    history_raw = data.get("history", [])
    history = history_raw if isinstance(history_raw, list) else []

    return Response(
        stream_longcat_response(
            prompt=message,
            attachments=attachments,
            history=history,
            include_phase=False,
        ),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/vision/transcript", methods=["POST"])
def vision_transcript() -> Response:
    data = request.get_json() or {}

    prompt = str(data.get("prompt") or "").strip()
    if not prompt:
        prompt = "Please transcribe all text and visual content from the attachments into well-formatted Markdown."

    attachments_raw = data.get("attachments", [])
    attachments = attachments_raw if isinstance(attachments_raw, list) else [attachments_raw]
    if not attachments:
        return jsonify({"error": "Missing 'attachments' field"}), 400

    return Response(
        stream_longcat_response(
            prompt=prompt,
            attachments=attachments,
            history=[],
            include_phase=True,
        ),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    port = int(os.getenv("AGENT_SERVER_PORT", "5678"))
    print(f"Starting Agent Kernel Server on http://127.0.0.1:{port}")
    print(f"Model: {MODEL}")
    print(f"Base URL: {base_url or '(default Anthropic API)'}")
    print(f"Vision model: {LONGCAT_MODEL}")
    print(f"Vision base URL: {LONGCAT_BASE_URL}")
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
