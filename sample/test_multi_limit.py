#!/usr/bin/env python3
"""测试多图数量上限"""

import io
import base64
from pathlib import Path
from openai import OpenAI
from PIL import Image

API_KEY = "ak_2Kq5H74bu2i31so1Fy54l8OD05L58"
BASE_URL = "https://api.longcat.chat/openai"
MODEL = "LongCat-Flash-Omni-2603"
IMAGE_PATH = Path(__file__).parent.parent / "diagram-1.png"

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)


def encode_image(image_path: Path, max_size: int = 256) -> str:
    img = Image.open(image_path)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=85)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def test_n_images(n: int):
    b64 = encode_image(IMAGE_PATH, max_size=256)
    images = [{"type": "input_image", "input_image": {"data": [b64], "type": "base64"}} for _ in range(n)]
    print(f"  {n}张图 ", end="")

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "图片里有什么文字？"},
                    *images,
                ],
            }],
            max_tokens=100,
            extra_body={"output_modalities": ["text"]},
        )
        u = resp.usage
        print(f"=> ✅ total_tokens={u.total_tokens}, image_tokens={u.prompt_tokens_details.image_tokens}")
        return True
    except Exception as e:
        err = e.body if hasattr(e, 'body') else str(e)[:80]
        print(f"=> ❌ {type(e).__name__}: {err}")
        return False


print("=" * 60)
print("多图数量上限测试（小图避免安全误触）")
print("=" * 60)

for n in [1, 2, 3, 5, 8, 10, 15, 20, 30, 50]:
    ok = test_n_images(n)
    if not ok:
        print("  数量上限可能已到达")
        break

print("\n" + "=" * 60)
