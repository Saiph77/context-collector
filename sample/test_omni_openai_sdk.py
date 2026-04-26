#!/usr/bin/env python3
"""
使用 OpenAI SDK 调用 LongCat-Flash-Omni-2603 全模态接口
测试 SDK 是否支持自定义 input_image content 类型
"""

import base64
import io
from pathlib import Path

from openai import OpenAI
from PIL import Image

API_KEY = "ak_2Kq5H74bu2i31so1Fy54l8OD05L58"
BASE_URL = "https://api.longcat.chat/openai"
MODEL = "LongCat-Flash-Omni-2603"
IMAGE_PATH = Path(__file__).parent.parent / "diagram-1.png"


def encode_image(image_path: Path, max_size: int = 1024, quality: int = 85) -> str:
    img = Image.open(image_path)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=quality)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def main():
    print("=" * 60)
    print("OpenAI SDK + LongCat-Flash-Omni-2603 多模态测试")
    print("=" * 60)

    base64_image = encode_image(IMAGE_PATH)
    print(f"图片编码完成 (长度: {len(base64_image)} chars)")

    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

    # 尝试使用 input_image 自定义类型
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "请描述这张图片的内容"},
                        {
                            "type": "input_image",
                            "input_image": {
                                "data": [base64_image],
                                "type": "base64",
                            },
                        },
                    ],
                }
            ],
            max_tokens=2000,
            extra_body={"output_modalities": ["text"]},  # SDK 可能不支持自定义字段，用 extra_body
        )

        print("\n✅ SDK 调用成功！")
        print(f"回复: {response.choices[0].message.content}")

    except Exception as e:
        print(f"\n❌ SDK 调用失败: {type(e).__name__}")
        print(f"详情: {e}")
        print("\n说明: OpenAI SDK 可能限制了 content 类型，建议使用 requests 直接调用。")


if __name__ == "__main__":
    main()
