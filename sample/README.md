# LongCat Omni OpenAI SDK Sample

This sample calls LongCat's OpenAI-compatible chat completions endpoint with
`LongCat-Flash-Omni-2603` and a local image input.

LongCat docs used:

- Base URL for OpenAI-compatible calls: `https://api.longcat.chat/openai`
- Endpoint behind the SDK: `/v1/chat/completions`
- Model: `LongCat-Flash-Omni-2603`
- Image input content type: `input_image`
- For the verified OpenAI SDK request, keep the body minimal. Adding optional
  omni fields such as `sessionId` or `output_modalities` returned HTTP 400 in
  this environment.

## Run

```bash
python3 -m venv sample/.venv
sample/.venv/bin/python -m pip install -r sample/requirements.txt
LONGCAT_API_KEY="your-api-key" sample/.venv/bin/python sample/longcat_omni_image.py
```

By default the script reads `diagram-1.png` from the project root and writes
the raw response to `sample/last_response.json`.
