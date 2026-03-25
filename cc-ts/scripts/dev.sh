#!/bin/bash
# Development utilities for cc-ts
# Usage: ./scripts/dev.sh [command]
#   test       - Run integration tests
#   demo       - Run streaming demo
#   server     - Start agent server
#   help       - Show this help

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║  $1"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
}

print_step() {
    echo -e "${BLUE}[Step $1]${NC} $2"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if agent server is running
check_server() {
    if curl -s http://127.0.0.1:5678/health > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Start agent server
start_server() {
    print_header "Starting Agent Server"

    cd agent_kernel

    if [ ! -d "venv" ]; then
        print_warning "Virtual environment not found, creating..."
        python3 -m venv venv
    fi

    source venv/bin/activate

    print_step "1/3" "Installing dependencies..."
    pip install -q -r requirements.txt
    print_success "Dependencies installed"

    print_step "2/3" "Starting server..."
    python3 server.py > /tmp/agent_server.log 2>&1 &
    echo $! > /tmp/agent_server.pid

    sleep 3

    if check_server; then
        print_success "Server started (PID: $(cat /tmp/agent_server.pid))"
        print_step "3/3" "Server logs: /tmp/agent_server.log"
    else
        print_error "Failed to start server"
        print_warning "Check logs: tail -f /tmp/agent_server.log"
        exit 1
    fi
}

# Run integration tests
run_tests() {
    print_header "Integration Tests"

    # Check server
    print_step "1/5" "Checking agent server..."
    if check_server; then
        print_success "Server is running"
    else
        print_warning "Server not running, starting..."
        start_server
    fi

    # Test health endpoint
    print_step "2/5" "Testing health endpoint..."
    HEALTH=$(curl -s http://127.0.0.1:5678/health)
    print_success "Health check passed: $HEALTH"

    # Test streaming endpoint
    print_step "3/5" "Testing streaming endpoint..."
    STREAM_OUTPUT=$(curl -sN -X POST http://127.0.0.1:5678/agent/stream \
      -H "Content-Type: application/json" \
      -d '{"message": "Count from 1 to 3", "contextFiles": []}' \
      --max-time 15 || true)

    CHUNK_COUNT=$(printf '%s' "$STREAM_OUTPUT" | grep -c '"type"[[:space:]]*:[[:space:]]*"chunk"' || true)
    DONE_COUNT=$(printf '%s' "$STREAM_OUTPUT" | grep -c '"type"[[:space:]]*:[[:space:]]*"done"' || true)
    ERROR_COUNT=$(printf '%s' "$STREAM_OUTPUT" | grep -c '"type"[[:space:]]*:[[:space:]]*"error"' || true)

    if [ "$ERROR_COUNT" -gt 0 ] || [ "$DONE_COUNT" -eq 0 ] || [ "$CHUNK_COUNT" -eq 0 ]; then
        print_error "Streaming test failed"
        echo "$STREAM_OUTPUT" | head -20
        exit 1
    fi
    print_success "Streaming test passed (chunks: $CHUNK_COUNT)"

    # Check TypeScript build
    print_step "4/5" "Checking TypeScript build..."
    if [ -f "dist/main/main.js" ] && [ -f "dist/renderer/app.js" ]; then
        print_success "TypeScript build exists"
    else
        print_warning "Building TypeScript..."
        npm run build > /dev/null 2>&1
        print_success "TypeScript build completed"
    fi

    # Verify IPC handlers
    print_step "5/5" "Verifying IPC handlers..."
    if grep -q "panel:send-agent-message-stream" dist/main/main.js && \
       grep -q "onAgentStreamChunk" dist/preload/index.js; then
        print_success "IPC handlers verified"
    else
        print_error "IPC handlers not found"
        exit 1
    fi

    print_header "All Tests Passed!"
    echo "Next: npm run start:fresh"
}

# Run streaming demo
run_demo() {
    print_header "Agent Streaming Demo"

    # Check server
    print_step "1/4" "Checking agent server..."
    if check_server; then
        HEALTH=$(curl -s http://127.0.0.1:5678/health)
        MODEL=$(echo $HEALTH | python3 -c "import sys, json; print(json.load(sys.stdin)['model'])" 2>/dev/null || echo "unknown")
        print_success "Server running (model: $MODEL)"
    else
        print_warning "Server not running, starting..."
        start_server
    fi

    # Test simple streaming
    print_step "2/4" "Testing simple streaming..."
    echo "Prompt: 'Say hello in 5 words'"
    echo "Response:"
    echo "─────────────────────────────────────────────────────────────"
    curl -N -s -X POST http://127.0.0.1:5678/agent/stream \
      -H "Content-Type: application/json" \
      -d '{"message": "Say hello in 5 words", "contextFiles": []}' 2>/dev/null | \
      while IFS= read -r line; do
        if [[ $line == data:* ]]; then
          content=$(echo "$line" | sed 's/^data: //' | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('content', ''), end='')" 2>/dev/null)
          echo -n "$content"
        fi
      done
    echo ""
    echo "─────────────────────────────────────────────────────────────"
    print_success "Simple streaming works"

    # Test with context
    print_step "3/4" "Testing streaming with context..."
    mkdir -p tmp_test
    cat > tmp_test/demo.md << 'EOF'
# Demo Context File
This is a test file for demonstrating context attachment.
## Features
- Context-aware responses
- File content integration
- Smart code analysis
EOF

    CONTEXT_JSON='{"message": "Summarize the attached file in one sentence", "contextFiles": [{"path": "tmp_test/demo.md", "content": "# Demo Context File\nThis is a test file for demonstrating context attachment.\n## Features\n- Context-aware responses\n- File content integration\n- Smart code analysis", "previewKind": "markdown"}]}'

    echo "Prompt: 'Summarize the attached file in one sentence'"
    echo "Response:"
    echo "─────────────────────────────────────────────────────────────"
    curl -N -s -X POST http://127.0.0.1:5678/agent/stream \
      -H "Content-Type: application/json" \
      -d "$CONTEXT_JSON" 2>/dev/null | \
      while IFS= read -r line; do
        if [[ $line == data:* ]]; then
          content=$(echo "$line" | sed 's/^data: //' | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('content', ''), end='')" 2>/dev/null)
          echo -n "$content"
        fi
      done
    echo ""
    echo "─────────────────────────────────────────────────────────────"
    rm -rf tmp_test
    print_success "Context streaming works"

    # Instructions
    print_step "4/4" "Ready for UI testing"
    print_header "Next Steps"
    echo "1. Start app:       ${YELLOW}npm run start:fresh${NC}"
    echo "2. Open panel:      ${YELLOW}Double Cmd+C${NC}"
    echo "3. Show agent chat: ${YELLOW}Cmd+Alt+B${NC}"
    echo "4. Show explorer:   ${YELLOW}Cmd+B${NC}"
    echo ""
    echo "Server PID: $(cat /tmp/agent_server.pid 2>/dev/null || echo 'N/A')"
    echo "To stop: kill \$(cat /tmp/agent_server.pid)"
}

# Show help
show_help() {
    echo "Development utilities for cc-ts"
    echo ""
    echo "Usage: ./scripts/dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  test       - Run integration tests"
    echo "  demo       - Run streaming demo"
    echo "  server     - Start agent server"
    echo "  help       - Show this help"
    echo ""
    echo "Examples:"
    echo "  ./scripts/dev.sh test"
    echo "  ./scripts/dev.sh demo"
    echo "  ./scripts/dev.sh server"
}

# Main
case "${1:-help}" in
    test)
        run_tests
        ;;
    demo)
        run_demo
        ;;
    server)
        start_server
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
