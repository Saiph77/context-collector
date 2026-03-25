#!/usr/bin/env python3
"""
Agent Kernel HTTP Server
Provides SSE streaming endpoint for Claude agent responses.
"""

import json
import os
import sys
from pathlib import Path
from typing import Iterator

from anthropic import Anthropic
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

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
custom_headers = {}
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
            **custom_headers
        }
    )
else:
    # For official Anthropic API
    client = Anthropic(api_key=effective_key)

MODEL = os.getenv("MODEL_ID", "claude-sonnet-4-6")

# Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for Electron renderer


def stream_agent_response(user_message: str, context_files: list) -> Iterator[str]:
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
            system_parts.append(item['content'])
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
                chunk = {
                    "type": "chunk",
                    "content": text,
                }
                yield f"data: {json.dumps(chunk)}\n\n"

        # Send completion signal
        done = {
            "type": "done",
            "timestamp": None,  # Will be set by client
        }
        yield f"data: {json.dumps(done)}\n\n"

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Stream error: {error_details}", file=sys.stderr)
        error = {
            "type": "error",
            "message": str(e),
        }
        yield f"data: {json.dumps(error)}\n\n"


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "model": MODEL})


@app.route("/agent/stream", methods=["POST"])
def agent_stream():
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
    data = request.get_json()

    if not data or "message" not in data:
        return jsonify({"error": "Missing 'message' field"}), 400

    user_message = data["message"]
    context_files = data.get("contextFiles", [])

    return Response(
        stream_agent_response(user_message, context_files),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("AGENT_SERVER_PORT", "5678"))
    print(f"Starting Agent Kernel Server on http://127.0.0.1:{port}")
    print(f"Model: {MODEL}")
    print(f"Base URL: {base_url or '(default Anthropic API)'}")
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
