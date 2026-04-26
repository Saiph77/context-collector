#!/usr/bin/env python3
"""
测试 LongCat-Flash-Omni-2603 多模态模型接口
使用 OpenAI SDK 调用 LongCat API 平台
"""

import base64
import io
from pathlib import Path
from openai import OpenAI

# 尝试导入 PIL 用于图片压缩
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("[警告] 未安装 Pillow，无法自动压缩图片。如遇到 413 错误，请手动缩小图片。")

# ============== 配置 ==============
API_KEY = "ak_2Kq5H74bu2i31so1Fy54l8OD05L58"
BASE_URL = "https://api.longcat.chat/openai"
MODEL = "LongCat-Flash-Omni-2603"
IMAGE_PATH = Path(__file__).parent.parent / "diagram-1.png"
# ============== 配置结束 ==============


def encode_image_to_base64(image_path: Path, max_size: int = 1024, quality: int = 85) -> str:
    """将图片文件转为 base64 字符串，支持自动压缩"""
    if not HAS_PIL:
        # 无 Pillow 时直接读取原图
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    img = Image.open(image_path)

    # 转换为 RGB（去除透明通道，兼容 JPEG）
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # 等比例缩放，限制最大边长
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

    # 保存到内存缓冲区，使用 JPEG 压缩
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=quality)
    buffer.seek(0)

    return base64.b64encode(buffer.read()).decode("utf-8")


def main():
    print("=" * 50)
    print("LongCat-Flash-Omni-2603 多模态接口测试")
    print("=" * 50)

    # 1. 检查图片文件
    if not IMAGE_PATH.exists():
        print(f"[错误] 图片文件不存在: {IMAGE_PATH}")
        return
    print(f"[1/4] 图片文件: {IMAGE_PATH} (大小: {IMAGE_PATH.stat().st_size} bytes)")

    # 2. 编码图片（自动压缩）
    base64_image = encode_image_to_base64(IMAGE_PATH, max_size=1024, quality=85)
    print(f"[2/4] 图片 Base64 编码完成 (长度: {len(base64_image)} chars)")
    if HAS_PIL:
        print("      已自动压缩图片 (max_size=1024, quality=85)")

    # 3. 初始化 OpenAI 客户端
    client = OpenAI(
        api_key=API_KEY,
        base_url=BASE_URL,
    )
    print(f"[3/4] OpenAI 客户端初始化完成")
    print(f"      Base URL: {BASE_URL}")
    print(f"      Model: {MODEL}")

    # 4. 构造多模态消息并发送请求
    print(f"[4/4] 发送多模态请求...")
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
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            },
                        },
                    ],
                }
            ],
            max_tokens=2000,
            temperature=0.7,
        )

        # 输出结果
        print("\n" + "=" * 50)
        print("接口调用成功！")
        print("=" * 50)
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
