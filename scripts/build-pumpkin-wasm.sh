#!/usr/bin/env bash
# ==============================================================================
# scripts/build-pumpkin-wasm.sh
#
# Builds the Pumpkin WebAssembly bridge crate (wasm/pumpkin) into
# public/pumpkin.wasm and generates browser/Node JS bindings at
# src/modeler/solvers/pumpkin/runtime.{js,d.ts}.
#
# Requirements:
#   - Rust toolchain (rustc & cargo) with wasm32-unknown-unknown target
#     (or Homebrew Rust with rust-src + lld/wasm-ld available)
#   - Node.js (to update pumpkin.config.json SHA-256 hashes)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CRATE_DIR="${REPO_ROOT}/wasm/pumpkin"

if ! command -v cargo >/dev/null 2>&1 || ! command -v rustc >/dev/null 2>&1; then
  echo "Error: rustc/cargo not found. Please install Rust." >&2
  exit 1
fi

if [ -n "${PUMPKIN_LLD_BIN:-}" ] && [ -d "${PUMPKIN_LLD_BIN}" ]; then
  export PATH="${PUMPKIN_LLD_BIN}:${PATH}"
fi

# Locate rust-lld / wasm-ld if not already on PATH
if ! command -v rust-lld >/dev/null 2>&1 && ! command -v wasm-ld >/dev/null 2>&1; then
  for candidate in /opt/homebrew/opt/lld/bin /opt/homebrew/opt/lld@21/bin /usr/local/opt/lld/bin; do
    if [ -x "${candidate}/wasm-ld" ] || [ -x "${candidate}/lld" ]; then
      export PATH="${candidate}:${PATH}"
      break
    fi
  done
fi

# Homebrew rustc invokes `rust-lld -flavor wasm` by default for wasm32-unknown-unknown
if ! command -v rust-lld >/dev/null 2>&1 && command -v lld >/dev/null 2>&1; then
  SHIM_LLD_DIR="$(mktemp -d)"
  trap 'rm -rf "${SHIM_LLD_DIR}"' EXIT
  ln -s "$(command -v lld)" "${SHIM_LLD_DIR}/rust-lld"
  export PATH="${SHIM_LLD_DIR}:${PATH}"
fi

echo "========================================================"
echo " Building Pumpkin WebAssembly (wasm/pumpkin)"
echo " Rustc:    $(rustc --version)"
echo " Crate:    ${CRATE_DIR}"
echo " RepoRoot: ${REPO_ROOT}"
echo "========================================================"

cd "${CRATE_DIR}"

TARGET_LIBDIR="$(rustc --print target-libdir --target wasm32-unknown-unknown 2>/dev/null || true)"
if [ -n "${TARGET_LIBDIR}" ] && ls "${TARGET_LIBDIR}"/libstd-*.rlib >/dev/null 2>&1; then
  cargo build --ignore-rust-version --release --target wasm32-unknown-unknown
else
  echo "Prebuilt wasm32-unknown-unknown std not found; building std from rust-src..."
  RUSTC_BOOTSTRAP=1 cargo build --ignore-rust-version --release --target wasm32-unknown-unknown -Z build-std=std,panic_abort
fi

cargo run --ignore-rust-version --example bindgen

cd "${REPO_ROOT}"
node scripts/ensure-pumpkin-wasm.mjs --update-hashes

echo "Built public/pumpkin.wasm ($(ls -lh public/pumpkin.wasm | awk '{print $5}'))"
