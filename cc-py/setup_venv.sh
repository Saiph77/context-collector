#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PY_BIN="${PYTHON_BIN:-}"
if [[ -z "$PY_BIN" ]]; then
  if command -v python3.13 >/dev/null 2>&1; then
    PY_BIN="$(command -v python3.13)"
  else
    PY_BIN="$(command -v python3)"
  fi
fi

echo "[setup] using python: $PY_BIN"
"$PY_BIN" -m venv .venv
source .venv/bin/activate
python -m pip install -U pip setuptools wheel
python -m pip install -r requirements.txt

echo "[setup] done. activate with: source .venv/bin/activate"
