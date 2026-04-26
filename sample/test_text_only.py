#!/usr/bin/env python3
"""纯文本连通性测试"""

from openai import OpenAI

API_KEY = "ak_2Kq5H74bu2i31so1Fy54l8OD05L58"
BASE_URL = "https://api.longcat.chat/openai"
MODEL = "LongCat-Flash-Omni-2603"

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

try:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "user", "content": "你好，请简短介绍一下自己"}
        ],
        max_tokens=500,
    )
    print("纯文本请求成功！")
    print(f"回复: {response.choices[0].message.content}")
    print(f"Tokens: {response.usage.total_tokens}")
except Exception as e:
    print(f"失败: {type(e).__name__}: {e}")
