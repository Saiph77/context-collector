#!/usr/bin/env python3
"""
精确测试 LongCat-Flash-Omni-2603 的图片尺寸上限
换用中性提示词避免安全审核误触
"""

import io
from pathlib import Path

from openai import OpenAI
from PIL import Image

API_KEY = "ak_2Kq5H74bu2i31so1Fy54l8OD05L58"
BASE_URL = "https://api.longcat.chat/openai"
MODEL = "LongCat-Flash-Omni-2603"
IMAGE_PATH = Path(__file__).parent.parent / "diagram-1.png"

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)


def encode_image(image_path: Path, max_size: int, quality: int = 85) -> str:
    import base64
    img = Image.open(image_path)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=quality)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def test_size(max_size: int, quality: int = 85):
    b64 = encode_image(IMAGE_PATH, max_size, quality)
    print(f"  max_size={max_size}, quality={quality}, base64={len(b64)} chars", end="")

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "请用一句话概括图片主题"},
                    {
                        "type": "input_image",
                        "input_image": {"data": [b64], "type": "base64"},
                    },
                ],
            }],
            max_tokens=50,
            extra_body={"output_modalities": ["text"]},
        )
        u = resp.usage
        print(f" => ✅ image_tokens={u.prompt_tokens_details.image_tokens}, total={u.total_tokens}")
        return True
    except Exception as e:
        err = e.body if hasattr(e, 'body') else str(e)
        print(f" => ❌ {type(e).__name__}: {err}")
        return False


def main():
    print("=" * 70)
    print("图片尺寸上限测试")
    print("=" * 70)

    # 1. 固定 quality=85，逐步增大尺寸
    print("\n[1] 固定 quality=85，增大 max_size:")
    sizes = [256, 512, 768, 1024, 1280, 1536, 1792, 2048, 2560, 3072, 4096]
    for size in sizes:
        ok = test_size(size)
        if not ok:
            break

    # 2. 固定 size=2048，测试低 quality 下的大图是否可行
    print("\n[2] 固定 max_size=2048，降低 quality:")
    qualities = [95, 85, 70, 50, 30, 10]
    for q in qualities:
        test_size(2048, quality=q)

    # 3. 超大图测试
    print("\n[3] 超大图极限测试 (quality=30):")
    for size in [4096, 8192]:
        test_size(size, quality=30)

    print("\n" + "=" * 70)
    print("测试完成")
    print("=" * 70)


if __name__ == "__main__":
    main()
