#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  echo "[run] .venv not found. run ./setup_venv.sh first"
  exit 1
fi

source .venv/bin/activate
exec env PYTHONPATH=src python -m cc_py.app
