#!/usr/bin/env python3
"""测试 input_image 的 data 字段用数组格式"""

import json
import requests
from test_omni_multimodal import encode_image, API_KEY, BASE_URL, MODEL, IMAGE_PATH

base64_image = encode_image(IMAGE_PATH)

payload = {
    "model": MODEL,
    "messages": [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "描述这张图片"},
                {
                    "type": "input_image",
                    "input_image": {
                        "data": [base64_image],  # 数组格式
                        "type": "base64"
                    }
                }
            ]
        }
    ],
    "stream": False,
    "max_tokens": 1000,
    "output_modalities": ["text"]
}

resp = requests.post(BASE_URL, headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}, json=payload, timeout=120)
print("Status:", resp.status_code)
print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
