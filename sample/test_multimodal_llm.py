#!/usr/bin/env python3
"""
LongCat-Flash-Omni-2603 多模态 LLM 接口调用示例
使用 OpenAI SDK 调用 LongCat API 平台的全模态接口

关键格式说明（与标准 OpenAI Vision API 不同）：
- 图片类型使用 "input_image" 而非 "image_url"
- input_image.data 必须传数组格式 [base64_string]
- content 必须是数组格式（即使是纯文本）
"""

import base64
import io
from pathlib import Path

from openai import OpenAI
from PIL import Image

# ============== 配置 ==============
API_KEY = "ak_2Kq5H74bu2i31so1Fy54l8OD05L58"
BASE_URL = "https://api.longcat.chat/openai"
MODEL = "LongCat-Flash-Omni-2603"
IMAGE_PATH = Path(__file__).parent.parent / "diagram-1.png"
# ============== 配置结束 ==============


def encode_image(image_path: Path, max_size: int = 1024, quality: int = 85) -> str:
    """
    将图片压缩并转为 base64 字符串
    - max_size: 限制最大边长，避免请求体过大导致 413
    - quality: JPEG 压缩质量
    """
    img = Image.open(image_path)

    # 去除透明通道（JPEG 不支持透明）
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # 等比例缩放
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

    # JPEG 压缩后写入内存缓冲区
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=quality)

    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def main():
    print("=" * 60)
    print("LongCat-Flash-Omni-2603 多模态接口调用")
    print("=" * 60)

    # 1. 检查并编码图片
    if not IMAGE_PATH.exists():
        print(f"[错误] 图片文件不存在: {IMAGE_PATH}")
        return

    base64_image = encode_image(IMAGE_PATH)
    print(f"[1/2] 图片编码完成: {IMAGE_PATH.name}")
    print(f"      Base64 长度: {len(base64_image)} chars")

    # 2. 初始化 OpenAI 客户端（指向 LongCat 端点）
    client = OpenAI(
        api_key=API_KEY,
        base_url=BASE_URL,
    )
    print(f"[2/2] 客户端初始化完成")
    print(f"      Base URL: {BASE_URL}")
    print(f"      Model: {MODEL}")

    # 3. 构造并发送多模态请求
    print(f"\n发送多模态请求...")
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "请详细描述这张图片的内容，包括其中的文字、图形和整体含义。",
                        },
                        {
                            # LongCat 全模态接口使用 input_image 类型
                            "type": "input_image",
                            "input_image": {
                                # data 必须是数组格式！
                                "data": [base64_image],
                                "type": "base64",
                            },
                        },
                    ],
                }
            ],
            max_tokens=2000,
            temperature=0.7,
            # 可通过 extra_body 传入 LongCat 特有字段
            extra_body={"output_modalities": ["text"]},
        )

        # 4. 输出结果
        print("\n" + "=" * 60)
        print("✅ 接口调用成功！")
        print("=" * 60)
        print(f"\n模型回复:\n{response.choices[0].message.content}")
        print(f"\n用量信息:")
        print(f"  Prompt tokens: {response.usage.prompt_tokens}")
        print(f"  Completion tokens: {response.usage.completion_tokens}")
        print(f"  Total tokens: {response.usage.total_tokens}")

    except Exception as e:
        print(f"\n[错误] 接口调用失败: {type(e).__name__}")
        print(f"详情: {e}")


if __name__ == "__main__":
    main()
