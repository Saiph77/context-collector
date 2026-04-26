#!/usr/bin/env python3
"""
测试 LongCat-Flash-Omni-2603 的多图支持和最大尺寸限制
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

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)


def encode_image(image_path: Path, max_size: int = 1024, quality: int = 85) -> str:
    img = Image.open(image_path)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=quality)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def test_single_image(max_size: int, desc: str):
    """测试单张图片不同尺寸"""
    base64_img = encode_image(IMAGE_PATH, max_size=max_size)
    print(f"\n[{desc}] max_size={max_size}, base64_length={len(base64_img)}")

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "描述图片"},
                    {
                        "type": "input_image",
                        "input_image": {"data": [base64_img], "type": "base64"},
                    },
                ],
            }],
            max_tokens=100,
            extra_body={"output_modalities": ["text"]},
        )
        usage = resp.usage
        print(f"  ✅ 成功 | image_tokens={usage.prompt_tokens_details.image_tokens}, total={usage.total_tokens}")
        return True
    except Exception as e:
        print(f"  ❌ 失败: {type(e).__name__}: {e}")
        return False


def test_multiple_images(count: int):
    """测试传入多张相同图片"""
    base64_img = encode_image(IMAGE_PATH, max_size=512)
    images = [{"type": "input_image", "input_image": {"data": [base64_img], "type": "base64"}} for _ in range(count)]

    print(f"\n[多图测试] 传入 {count} 张图片, 每张 base64_length={len(base64_img)}")

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": f"这里有{count}张图片，请分别描述每张图片的内容。"},
                    *images,
                ],
            }],
            max_tokens=500,
            extra_body={"output_modalities": ["text"]},
        )
        usage = resp.usage
        print(f"  ✅ 成功 | image_tokens={usage.prompt_tokens_details.image_tokens}, total={usage.total_tokens}")
        print(f"  回复: {resp.choices[0].message.content[:100]}...")
        return True
    except Exception as e:
        print(f"  ❌ 失败: {type(e).__name__}: {e}")
        return False


def main():
    print("=" * 60)
    print("LongCat-Flash-Omni-2603 多图 & 尺寸限制测试")
    print("=" * 60)

    # 1. 单图尺寸测试
    print("\n--- 单图尺寸测试 ---")
    sizes = [256, 512, 1024, 1536, 2048, 3072, 4096]
    for size in sizes:
        ok = test_single_image(size, f"尺寸{size}")
        if not ok:
            print(f"  ⚠️  size={size} 失败，可能是上限或请求体过大")
            break

    # 2. 多图测试
    print("\n--- 多图数量测试 ---")
    for count in [1, 2, 3, 5, 10]:
        ok = test_multiple_images(count)
        if not ok:
            print(f"  ⚠️  {count}张图失败，可能是数量上限")
            break

    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)


if __name__ == "__main__":
    main()
