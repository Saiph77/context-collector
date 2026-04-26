#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/agent_kernel"
SERVER_VENV="$SERVER_DIR/venv"
SERVER_LOG="$ROOT_DIR/.local/vision-server.log"
SERVER_PID_FILE="$ROOT_DIR/.local/vision-server.pid"
# 与 agent_kernel/server.py 的 AGENT_SERVER_PORT 默认一致
SERVER_PORT="${AGENT_SERVER_PORT:-5678}"
SERVER_URL="http://127.0.0.1:${SERVER_PORT}/health"
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

  if [[ ! -d "$SERVER_VENV" ]]; then
    log "Creating Python venv at $SERVER_VENV"
    python3 -m venv "$SERVER_VENV"
  fi

  # shellcheck disable=SC1091
  source "$SERVER_VENV/bin/activate"
  pip install -q -r "$SERVER_DIR/requirements.txt"

  log "Starting vision server..."
  (
    cd "$SERVER_DIR"
    python3 server.py
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
  ensure_longcat_key
  start_server

  log "Installing JS deps..."
  npm install

  log "Rebuilding native addon..."
  npm run native:build

  log "Building app..."
  npm run build

  log "Launching Electron..."
  npm start
}

main "$@"
