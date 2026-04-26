#!/usr/bin/env python3
"""Call LongCat-Flash-Omni-2603 with OpenAI's Python SDK and a local image."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
from pathlib import Path
from typing import Any

from openai import APIStatusError, OpenAI


DEFAULT_BASE_URL = "https://api.longcat.chat/openai"
DEFAULT_MODEL = "LongCat-Flash-Omni-2603"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IMAGE = PROJECT_ROOT / "diagram-1.png"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "last_response.json"


def encode_image(image_path: Path) -> str:
    return base64.b64encode(image_path.read_bytes()).decode("utf-8")


def build_messages(image_path: Path, prompt: str) -> list[dict[str, Any]]:
    encoded_image = encode_image(image_path)
    mime_type = mimetypes.guess_type(image_path.name)[0] or "image/png"

    return [
        {
            "role": "system",
            "content": [
                {
                    "type": "text",
                    "text": "你是一个谨慎的多模态助手，请基于图片内容直接回答。",
                }
            ],
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_image",
                    "input_image": {
                        "type": "base64",
                        "data": [encoded_image],
                    },
                },
                {
                    "type": "text",
                    "text": f"{prompt}\n\n图片 MIME 类型：{mime_type}",
                },
            ],
        },
    ]


def dump_response(response: Any, output_path: Path) -> None:
    if hasattr(response, "model_dump"):
        payload = response.model_dump(mode="json")
    else:
        payload = response

    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Use OpenAI SDK to call LongCat-Flash-Omni-2603 with an image."
    )
    parser.add_argument("--image", type=Path, default=DEFAULT_IMAGE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--max-tokens", type=int, default=512)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument(
        "--prompt",
        default="请识别并概括这张图片的主要内容。如果图片里有文字或流程关系，请一并说明。",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_key = os.environ.get("LONGCAT_API_KEY")
    if not api_key:
        print("Missing LONGCAT_API_KEY environment variable.", file=sys.stderr)
        return 2

    image_path = args.image.expanduser().resolve()
    if not image_path.exists():
        print(f"Image not found: {image_path}", file=sys.stderr)
        return 2

    client = OpenAI(api_key=api_key, base_url=args.base_url)
    messages = build_messages(image_path, args.prompt)

    try:
        response = client.chat.completions.create(
            model=args.model,
            messages=messages,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            stream=False,
        )
    except APIStatusError as exc:
        print(f"LongCat API returned HTTP {exc.status_code}", file=sys.stderr)
        print(exc.response.text, file=sys.stderr)
        return 1

    dump_response(response, args.output)
    content = response.choices[0].message.content

    print("LongCat Omni call succeeded.")
    print(f"Model: {response.model}")
    print(f"Response saved to: {args.output}")
    if getattr(response, "usage", None):
        print(f"Usage: {response.usage}")
    print("\nAssistant response:")
    print(content)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
