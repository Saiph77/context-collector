#!/usr/bin/env python3
"""
使用 requests 直接调用 LongCat-Flash-Omni-2603 多模态接口
关键发现：该模型要求 content 必须是数组格式
"""

import base64
import io
import json
from pathlib import Path

import requests
from PIL import Image

API_KEY = "ak_2Kq5H74bu2i31so1Fy54l8OD05L58"
BASE_URL = "https://api.longcat.chat/openai/v1/chat/completions"
MODEL = "LongCat-Flash-Omni-2603"
IMAGE_PATH = Path(__file__).parent.parent / "diagram-1.png"


def encode_image(image_path: Path, max_size: int = 1024, quality: int = 85) -> str:
    """压缩并编码图片为 base64"""
    img = Image.open(image_path)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=quality)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def main():
    print("=" * 60)
    print("LongCat-Flash-Omni-2603 多模态接口测试 (requests)")
    print("=" * 60)

    if not IMAGE_PATH.exists():
        print(f"[错误] 图片不存在: {IMAGE_PATH}")
        return

    print(f"[1/3] 图片: {IMAGE_PATH} ({IMAGE_PATH.stat().st_size} bytes)")

    base64_image = encode_image(IMAGE_PATH)
    print(f"[2/3] Base64 编码完成 (长度: {len(base64_image)} chars)")

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "请详细描述这张图片的内容，包括其中的文字、图形和整体含义。",
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        },
                    },
                ],
            }
        ],
        "max_tokens": 2000,
    }

    print(f"[3/3] 发送请求到 {BASE_URL} ...")
    response = requests.post(BASE_URL, headers=headers, json=payload, timeout=120)

    print(f"\nHTTP 状态码: {response.status_code}")
    print(f"响应内容:")
    try:
        data = response.json()
        print(json.dumps(data, indent=2, ensure_ascii=False))

        if "choices" in data:
            print("\n" + "=" * 60)
            print("模型回复:")
            print("=" * 60)
            print(data["choices"][0]["message"]["content"])
            if "usage" in data:
                print(f"\n用量: {data['usage']}")
    except Exception:
        print(response.text)


if __name__ == "__main__":
    main()
