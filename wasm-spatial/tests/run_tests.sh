#!/bin/bash
# wasm-spatial/tests/run_tests.sh
#
# Build and run the native spatial engine tests under ASan + UBSan.
# The engine is not wired into the app, so these are the only automated
# checks that cover it.
#
# Usage: bash wasm-spatial/tests/run_tests.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CXX="${CXX:-clang++}"
OUT="$(mktemp -d)/spatial_engine_test"

"$CXX" -std=c++17 -g -O1 \
  -fsanitize=address,undefined \
  -fno-omit-frame-pointer \
  -fno-sanitize-recover=all \
  -Wall -Wextra \
  "$SCRIPT_DIR/spatial_engine_test.cpp" \
  -o "$OUT"

ASAN_OPTIONS=detect_leaks=0:abort_on_error=1 \
UBSAN_OPTIONS=print_stacktrace=1:halt_on_error=1 \
  "$OUT"