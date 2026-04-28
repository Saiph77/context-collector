#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/agent_kernel"
SERVER_VENV="$SERVER_DIR/venv"
SERVER_LOG="$ROOT_DIR/.local/vision-server.log"
SERVER_PID_FILE="$ROOT_DIR/.local/vision-server.pid"
ELECTRON_MIRROR_DEFAULT="https://npmmirror.com/mirrors/electron/"
NPM_REGISTRY_FALLBACK_DEFAULT="https://registry.npmmirror.com"
# 与 agent_kernel/server.py 的 AGENT_SERVER_PORT 默认一致
SERVER_PORT="${AGENT_SERVER_PORT:-5678}"
SERVER_URL="http://127.0.0.1:${SERVER_PORT}/health"
# 创建 vision venv 时使用的 Python；未设置则自动探测（见 resolve_python_for_venv）
# export VENV_PYTHON=/path/to/python3
export AGENT_SERVER_PORT="$SERVER_PORT"
HARDCODED_LONGCAT_API_KEY="ak_2Kq5H74bu2i31so1Fy54l8OD05L58"

mkdir -p "$ROOT_DIR/.local"

log() {
  printf '[vision-start] %s\n' "$*"
}

# node-gyp (electron-rebuild) 自 Python 3.12+ 起无法使用已移除的 distutils；若 PATH 默认是
# Homebrew 的 3.13/3.14，postinstall 会失败。未设置 PYTHON 时，优先用仍带 distutils 的
# /usr/bin/python3（当前 macOS 上多为 3.9.x）。
ensure_python_for_node_gyp() {
  if [[ -n "${PYTHON:-}" ]]; then
    return 0
  fi
  if [[ -x /usr/bin/python3 ]] && /usr/bin/python3 -c "from distutils.version import StrictVersion" 2>/dev/null; then
    export PYTHON="/usr/bin/python3"
    log "Using $PYTHON for node-gyp (std distutils; avoids gyp + Homebrew 3.12+ break)."
  fi
}

cleanup_stale_npm_dirs() {
  local node_modules_dir="$ROOT_DIR/node_modules"
  [[ -d "$node_modules_dir" ]] || return 0

  # npm on macOS may leave half-renamed temp dirs like .cacache-xxxx, which
  # later cause ENOTEMPTY during the next install rename step.
  find "$node_modules_dir" -maxdepth 1 -type d -name ".cacache-*" -exec rm -rf {} + 2>/dev/null || true
}

install_js_deps() {
  if [[ -x "$ROOT_DIR/node_modules/.bin/electron-rebuild" && -d "$ROOT_DIR/node_modules/electron" ]]; then
    log "JS deps already present; skip npm install."
    return 0
  fi

  if npm install --no-audit --no-fund; then
    return 0
  fi

  local fallback_registry="${NPM_REGISTRY_FALLBACK:-$NPM_REGISTRY_FALLBACK_DEFAULT}"
  log "npm install failed; cleaning stale npm dirs and retrying without lockfile (registry: $fallback_registry)..."
  cleanup_stale_npm_dirs
  if npm install --package-lock=false --no-audit --no-fund --registry="$fallback_registry"; then
    return 0
  fi

  log "Fallback install failed; removing node_modules and retrying once..."
  rm -rf "$ROOT_DIR/node_modules"
  if npm install --package-lock=false --no-audit --no-fund --registry="$fallback_registry"; then
    return 0
  fi

  log "JS dependency installation failed."
  return 1
}

# 结束本仓库此前残留的 Electron / npm / node（与 start.sh 同逻辑，避免与单例或旧 build 冲突）
kill_existing_cc_ts_processes() {
  log "Stopping previous cc-ts (Electron / npm / node) for this project..."

  local pids=()
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(
    ps -axo pid=,command= 2>/dev/null | awk -v dir="$ROOT_DIR" '
      index($0, dir) && ($0 ~ /electron|npm|node/) { print $1 }
    '
  )

  if [[ ${#pids[@]} -eq 0 ]]; then
    log "No matching Electron/npm/node process in project path."
    return
  fi

  local self_pid="$$"
  local parent_pid="${PPID:-0}"
  for pid in "${pids[@]}"; do
    if [[ "$pid" == "$self_pid" || "$pid" == "$parent_pid" ]]; then
      continue
    fi
    kill -TERM "$pid" 2>/dev/null || true
  done
  sleep 1
  for pid in "${pids[@]}"; do
    if [[ "$pid" == "$self_pid" || "$pid" == "$parent_pid" ]]; then
      continue
    fi
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  log "cc-ts process cleanup done."
}

cleanup() {
  if [[ -f "$SERVER_PID_FILE" ]]; then
    local pid
    pid="$(cat "$SERVER_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      log "Stopping vision server (PID: $pid)"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$SERVER_PID_FILE"
  fi
}

ensure_longcat_key() {
  if [[ -n "${HARDCODED_LONGCAT_API_KEY:-}" ]]; then
    export LONGCAT_API_KEY="$HARDCODED_LONGCAT_API_KEY"
    return
  fi

  if [[ -z "${LONGCAT_API_KEY:-}" && -f "$SERVER_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$SERVER_DIR/.env"
    set +a
  fi

  if [[ -z "${LONGCAT_API_KEY:-}" ]]; then
    cat >&2 <<'EOF'
[vision-start] Missing LONGCAT_API_KEY.

Set one of the following before running:
1) export LONGCAT_API_KEY='your-real-key'
2) add LONGCAT_API_KEY=your-real-key into agent_kernel/.env
EOF
    exit 2
  fi
}

ensure_anthropic_key_fallback() {
  if [[ -z "${LONGCAT_API_KEY:-}" ]]; then
    log "LONGCAT_API_KEY is empty; cannot set Anthropic fallback keys."
    exit 2
  fi

  local applied=0
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    export ANTHROPIC_API_KEY="$LONGCAT_API_KEY"
    applied=1
  fi
  if [[ -z "${ANTHROPIC_AUTH_TOKEN:-}" ]]; then
    export ANTHROPIC_AUTH_TOKEN="$LONGCAT_API_KEY"
    applied=1
  fi

  if [[ "$applied" -eq 1 ]]; then
    log "Anthropic env incomplete; fallback to LONGCAT_API_KEY applied."
  fi
}

# 在 macOS 上找能运行 `python3 -m venv` 的解释器；顺序：$VENV_PYTHON → PATH 的 python3 → /usr/bin/python3
resolve_python_for_venv() {
  local -a try_paths=()
  if [[ -n "${VENV_PYTHON:-}" ]]; then
    try_paths+=("$VENV_PYTHON")
  fi
  if command -v python3 >/dev/null 2>&1; then
    try_paths+=("$(command -v python3)")
  fi
  if [[ -x /usr/bin/python3 ]]; then
    try_paths+=("/usr/bin/python3")
  fi

  local p seen=""
  for p in "${try_paths[@]}"; do
    [[ -z "$p" || ! -x "$p" ]] && continue
    # 避免 PATH 与 /usr/bin 重复探测同一文件
    case " $seen " in
      *" $p "*) continue ;;
    esac
    seen+=" $p"
    if "$p" -c "import venv" 2>/dev/null; then
      echo "$p"
      return 0
    fi
  done

  log "No Python 3 with the 'venv' stdlib module was found."
  printf '%s\n' "[vision-start] Install Python 3, or set VENV_PYTHON to a python3 binary." \
    "  - https://www.python.org/downloads/macos/  " \
    "  - brew install python  " \
    "  - xcode-select --install  (Command Line Tools; may include python3)" >&2
  exit 1
}

# 若无 venv 则创建；若目录存在但 bin/python 缺失则视为损坏并重建
ensure_vision_venv() {
  mkdir -p "$SERVER_DIR"

  local py_new
  py_new="$(resolve_python_for_venv)"

  if [[ -d "$SERVER_VENV" ]]; then
    local vcheck="${SERVER_VENV}/bin/python3"
    [[ -x "$vcheck" ]] || vcheck="${SERVER_VENV}/bin/python"
    if [[ ! -x "$vcheck" ]]; then
      log "Venv at $SERVER_VENV is incomplete; recreating."
      rm -rf "$SERVER_VENV"
    fi
  fi

  if [[ ! -d "$SERVER_VENV" ]]; then
    log "Creating Python venv at $SERVER_VENV (using $py_new)"
    if ! "$py_new" -m venv "$SERVER_VENV"; then
      log "Failed: python3 -m venv. If this is a fresh Mac, try: xcode-select --install"
      exit 1
    fi
  fi
}

# 在全新或精简的 venv 中若无 pip，用 ensurepip 补装
ensure_venv_pip() {
  local venv_py="$1"
  if "$venv_py" -m pip --version >/dev/null 2>&1; then
    return 0
  fi
  log "No pip in venv; running ensurepip..."
  if ! "$venv_py" -m ensurepip --upgrade; then
    log "Could not install pip into the venv. Remove $SERVER_VENV and run this script again."
    exit 1
  fi
}

# 每次启动先停掉旧进程，再拉起新服务（避免沿用旧代码驻留的 Python 进程）
stop_existing_vision_server() {
  if [[ -f "$SERVER_PID_FILE" ]]; then
    local pid
    pid="$(cat "$SERVER_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      log "Stopping previous vision server (PID: $pid)"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$SERVER_PID_FILE"
  fi

  # 无 pid 文件但端口仍被占用时（手启或其它脚本起的 server）
  local port_pids
  port_pids="$(lsof -t -i ":${SERVER_PORT}" 2>/dev/null || true)"
  if [[ -n "${port_pids:-}" ]]; then
    log "Freeing port ${SERVER_PORT} (PIDs: $(echo "$port_pids" | tr '\n' ' '))"
    # shellcheck disable=SC2086
    kill ${port_pids} 2>/dev/null || true
    sleep 0.4
  fi
}

start_server() {
  log "Restarting vision server (stale process cleared so code changes take effect)..."
  stop_existing_vision_server

  ensure_vision_venv

  # 显式使用 venv 内解释器，不依赖 source activate
  local venv_py="${SERVER_VENV}/bin/python3"
  if [[ ! -x "$venv_py" ]]; then
    venv_py="${SERVER_VENV}/bin/python"
  fi
  if [[ ! -x "$venv_py" ]]; then
    log "Venv is missing a python executable; removing $SERVER_VENV — run the script again."
    rm -rf "$SERVER_VENV"
    exit 1
  fi

  ensure_venv_pip "$venv_py"

  if [[ ! -f "$SERVER_DIR/requirements.txt" ]]; then
    log "Missing $SERVER_DIR/requirements.txt"
    exit 1
  fi
  "$venv_py" -m pip install -q -r "$SERVER_DIR/requirements.txt"

  log "Starting vision server..."
  (
    cd "$SERVER_DIR"
    "$venv_py" server.py
  ) >"$SERVER_LOG" 2>&1 &
  echo "$!" >"$SERVER_PID_FILE"

  local retries=40
  while (( retries > 0 )); do
    if curl -sSf "$SERVER_URL" >/dev/null 2>&1; then
      log "Vision server is ready."
      return
    fi
    sleep 0.5
    retries=$((retries - 1))
  done

  log "Vision server failed to start. See log: $SERVER_LOG"
  exit 1
}

main() {
  trap cleanup EXIT INT TERM

  cd "$ROOT_DIR"

  kill_existing_cc_ts_processes
  ensure_python_for_node_gyp
  export ELECTRON_MIRROR="${ELECTRON_MIRROR:-$ELECTRON_MIRROR_DEFAULT}"
  ensure_longcat_key
  ensure_anthropic_key_fallback
  start_server

  log "Installing JS deps..."
  install_js_deps

  log "Rebuilding native addon..."
  npm run native:build

  log "Building app..."
  npm run build

  log "Launching Electron..."
  npm start
}

main "$@"
