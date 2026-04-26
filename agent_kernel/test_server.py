#!/usr/bin/env python3
"""
Test script for Agent Kernel Server
"""

import json
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import URLError


def test_health():
    """Test health endpoint."""
    print("Testing /health endpoint...")
    try:
        req = Request("http://127.0.0.1:5678/health")
        with urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            print(f"✓ Health check passed: {data}")
            return True
    except URLError as e:
        print(f"✗ Health check failed: {e}")
        return False


def test_stream():
    """Test streaming endpoint."""
    print("\nTesting /agent/stream endpoint...")

    payload = {
        "message": "Hello! Please introduce yourself briefly.",
        "contextFiles": []
    }

    try:
        req = Request(
            "http://127.0.0.1:5678/agent/stream",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"}
        )

        print("Streaming response:")
        print("-" * 60)

        with urlopen(req, timeout=30) as response:
            buffer = b""
            full_content = ""

            while True:
                chunk = response.read(1024)
                if not chunk:
                    break

                buffer += chunk
                lines = buffer.split(b"\n")
                buffer = lines[-1]

                for line in lines[:-1]:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data: "):
                        json_str = line_str[6:]
                        try:
                            data = json.loads(json_str)
                            if data["type"] == "chunk":
                                content = data.get("content", "")
                                full_content += content
                                print(content, end="", flush=True)
                            elif data["type"] == "done":
                                print("\n" + "-" * 60)
                                print("✓ Stream completed successfully")
                                print(f"Total characters received: {len(full_content)}")
                                return True
                            elif data["type"] == "error":
                                print(f"\n✗ Error: {data.get('message', 'Unknown error')}")
                                return False
                        except json.JSONDecodeError as e:
                            print(f"\n✗ Failed to parse JSON: {e}")
                            return False

        print("\n✗ Stream ended unexpectedly")
        return False

    except URLError as e:
        print(f"✗ Stream test failed: {e}")
        return False


def main():
    """Run all tests."""
    print("=" * 60)
    print("Agent Kernel Server Test Suite")
    print("=" * 60)

    # Wait for server to start
    print("\nWaiting for server to start...")
    for i in range(10):
        try:
            req = Request("http://127.0.0.1:5678/health")
            with urlopen(req, timeout=1) as response:
                response.read()
                break
        except URLError:
            if i < 9:
                print(".", end="", flush=True)
                time.sleep(1)
            else:
                print("\n✗ Server not responding. Is it running?")
                print("Start server with: ./start_server.sh")
                sys.exit(1)

    print("\n")

    # Run tests
    results = []
    results.append(("Health Check", test_health()))
    results.append(("Streaming", test_stream()))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {name}")

    all_passed = all(result[1] for result in results)

    print("=" * 60)
    if all_passed:
        print("All tests passed!")
        sys.exit(0)
    else:
        print("Some tests failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
