#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_MIRROR_DEFAULT="https://npmmirror.com/mirrors/electron/"

log() {
  printf '[cc-ts] %s\n' "$*"
}

kill_existing_processes() {
  log "Scanning for old cc-ts processes..."

  local pids=()
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(
    ps -axo pid=,command= | awk -v dir="$PROJECT_DIR" '
      index($0, dir) && ($0 ~ /electron|npm|node/) { print $1 }
    '
  )

  if [[ ${#pids[@]} -eq 0 ]]; then
    log "No old process found."
    return
  fi

  local self_pid="$$"
  local parent_pid="$PPID"

  log "Stopping old processes: ${pids[*]}"
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

  log "Old process cleanup done."
}

ensure_tools() {
  command -v npm >/dev/null 2>&1 || {
    echo "[cc-ts] npm not found. Please install Node.js >= 20." >&2
    exit 1
  }
}

main() {
  cd "$PROJECT_DIR"

  ensure_tools
  kill_existing_processes

  export ELECTRON_MIRROR="${ELECTRON_MIRROR:-$ELECTRON_MIRROR_DEFAULT}"

  log "Running npm install (mirror: $ELECTRON_MIRROR)"
  npm install

  log "Building native bridge"
  npm run native:build

  log "Building project"
  npm run build

  log "Starting app"
  npm start
}

main "$@"
