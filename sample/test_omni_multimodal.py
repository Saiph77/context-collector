#!/usr/bin/env python3
"""
LongCat-Flash-Omni-2603 全模态接口测试
根据官方文档，使用 input_image 格式而非 image_url
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
    print("LongCat-Flash-Omni-2603 全模态接口测试")
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

    # 根据官方文档：全模态接口使用 input_image 类型
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": [
                    {"type": "text", "text": "你是一个专业的图像分析助手"}
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "请详细描述这张图片的内容，包括其中的文字、图形和整体含义。",
                    },
                    {
                        "type": "input_image",
                        "input_image": {
                            "data": base64_image,
                            "type": "base64",
                        },
                    },
                ],
            },
        ],
        "stream": False,
        "max_tokens": 2000,
        "temperature": 0.7,
        "output_modalities": ["text"],
    }

    print(f"[3/3] 发送全模态请求到 {BASE_URL} ...")
    print(f"      使用 input_image 格式传入图片")
    response = requests.post(BASE_URL, headers=headers, json=payload, timeout=120)

    print(f"\nHTTP 状态码: {response.status_code}")
    try:
        data = response.json()
        print("响应内容:")
        print(json.dumps(data, indent=2, ensure_ascii=False))

        if response.status_code == 200 and "choices" in data:
            print("\n" + "=" * 60)
            print("✅ 接口调用成功！")
            print("=" * 60)
            print(f"\n模型回复:\n{data['choices'][0]['message']['content']}")
            if "usage" in data:
                print(f"\n用量信息: {data['usage']}")
        else:
            print("\n[错误] 接口返回异常")

    except Exception as e:
        print(f"解析响应失败: {e}")
        print(response.text)


if __name__ == "__main__":
    main()
