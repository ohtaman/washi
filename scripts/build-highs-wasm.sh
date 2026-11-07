#!/usr/bin/env bash
# ==============================================================================
# scripts/build-highs-wasm.sh
#
# Direct WebAssembly build script for HiGHS (ERGO-Code/HiGHS).
# Compiles HiGHS static library into a portable single-threaded WebAssembly
# binary and ES module driver exporting the official C API (highs_c_api.h).
#
# Requirements:
#   - Emscripten SDK (emsdk with emcc / em++ on PATH or EMSDK env var)
#   - CMake (>= 3.20)
#   - Ninja build tool
#   - Git
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONFIG_FILE="${REPO_ROOT}/highs.config.json"
DEFAULT_VERSION="v1.15.1"
DEFAULT_REPO="https://github.com/ERGO-Code/HiGHS.git"

if [ -f "${CONFIG_FILE}" ] && command -v node >/dev/null 2>&1; then
  DEFAULT_VERSION="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version||"v1.15.1")}catch{console.log("v1.15.1")}' "${CONFIG_FILE}")"
  DEFAULT_REPO="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).repo||"https://github.com/ERGO-Code/HiGHS.git")}catch{console.log("https://github.com/ERGO-Code/HiGHS.git")}' "${CONFIG_FILE}")"
fi

HIGHS_VERSION="${HIGHS_VERSION:-${DEFAULT_VERSION}}"
HIGHS_REPO="${HIGHS_REPO:-${DEFAULT_REPO}}"
SRC_DIR="${HIGHS_DIR:-/tmp/highs}"
BUILD_DIR="${HIGHS_BUILD_DIR:-/tmp/highs-wasm-build}"

echo "========================================================"
echo " Building HiGHS WebAssembly (Direct C API)"
echo " Version:   ${HIGHS_VERSION}"
echo " Source:    ${SRC_DIR}"
echo " Build Dir: ${BUILD_DIR}"
echo " Repo Root: ${REPO_ROOT}"
echo "========================================================"

# 1. Ensure Emscripten environment is active
if ! command -v emcc >/dev/null 2>&1; then
  if [ -n "${EMSDK:-}" ] && [ -f "${EMSDK}/emsdk_env.sh" ]; then
    echo "Activating EMSDK from ${EMSDK}..."
    # shellcheck disable=SC1091
    source "${EMSDK}/emsdk_env.sh"
  elif [ -f "/tmp/emsdk/emsdk_env.sh" ]; then
    echo "Activating EMSDK from /tmp/emsdk..."
    # shellcheck disable=SC1091
    source "/tmp/emsdk/emsdk_env.sh"
  else
    echo "Error: emcc not found. Please install and activate Emscripten SDK." >&2
    exit 1
  fi
fi

echo "Using Emscripten: $(emcc -v 2>&1 | head -n 1)"

# 2. Obtain HiGHS source code and ensure target version is checked out
if [ ! -f "${SRC_DIR}/CMakeLists.txt" ]; then
  echo "Cloning HiGHS ${HIGHS_VERSION} into ${SRC_DIR}..."
  mkdir -p "$(dirname "${SRC_DIR}")"
  git clone --depth 1 --branch "${HIGHS_VERSION}" "${HIGHS_REPO}" "${SRC_DIR}"
else
  echo "Using existing HiGHS source at ${SRC_DIR} (checking out ${HIGHS_VERSION})..."
  git -C "${SRC_DIR}" fetch --depth 1 origin tag "${HIGHS_VERSION}" 2>/dev/null || \
    git -C "${SRC_DIR}" fetch --depth 1 origin "${HIGHS_VERSION}"
  git -C "${SRC_DIR}" checkout "${HIGHS_VERSION}" 2>/dev/null || \
    git -C "${SRC_DIR}" checkout FETCH_HEAD
fi

# 3. Configure and build libhighs.a
echo "Configuring HiGHS CMake with emcmake..."
mkdir -p "${BUILD_DIR}"
cd "${BUILD_DIR}"

emcmake cmake "${SRC_DIR}" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DHIGHSINT64=OFF \
  -DHIGHS_NO_DEFAULT_THREADS=ON \
  -DZLIB=OFF \
  -DBUILD_SHARED_LIBS=OFF \
  -DBUILD_TESTING=OFF \
  -DBUILD_EXAMPLES=OFF \
  -DCMAKE_CXX_FLAGS="-O3 -fwasm-exceptions" \
  -DCMAKE_C_FLAGS="-O3"

echo "Compiling libhighs.a..."
ninja libhighs.a

LIB_HIGHS="${BUILD_DIR}/lib/libhighs.a"
if [ ! -f "${LIB_HIGHS}" ]; then
  echo "Error: ${LIB_HIGHS} was not created!" >&2
  exit 1
fi
echo "libhighs.a built successfully: $(ls -lh "${LIB_HIGHS}" | awk '{print $5}')"

# 4. Link into WebAssembly and ES module runtime
OUTPUT_JS="${REPO_ROOT}/src/modeler/solvers/highs/runtime.js"
OUTPUT_WASM="${REPO_ROOT}/public/highs.wasm"
TMP_WASM="${BUILD_DIR}/highs_raw.wasm"

echo "Linking WebAssembly binary and ES runtime with em++..."

em++ "${LIB_HIGHS}" \
  -O3 \
  -fwasm-exceptions \
  -sALLOW_MEMORY_GROWTH=1 \
  -sALLOW_TABLE_GROWTH=1 \
  -sSTACK_SIZE=4194304 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME='createHiGHS' \
  -sEXPORTED_RUNTIME_METHODS="['FS','cwrap','ccall','stringToUTF8','UTF8ToString','getValue','setValue','addFunction','removeFunction','HEAP8','HEAPU8','HEAP32','HEAPU32','HEAPF64','wasmMemory']" \
  -sEXPORTED_FUNCTIONS="['_Highs_create','_Highs_destroy','_Highs_clearModel','_Highs_version','_Highs_readModel','_Highs_run','_Highs_getNumCol','_Highs_getNumRow','_Highs_getNumNz','_Highs_getObjectiveValue','_Highs_getModelStatus','_Highs_getSolution','_Highs_getColName','_Highs_getRowName','_Highs_getColIntegrality','_Highs_changeObjectiveOffset','_Highs_getObjectiveOffset','_Highs_setBoolOptionValue','_Highs_setIntOptionValue','_Highs_setDoubleOptionValue','_Highs_setStringOptionValue','_Highs_setSolution','_Highs_setSparseSolution','_Highs_getIntInfoValue','_Highs_getDoubleInfoValue','_Highs_getInt64InfoValue','_Highs_setCallback','_Highs_startCallback','_Highs_stopCallback','_malloc','_free']" \
  -o "${OUTPUT_JS}"

# Emscripten outputs runtime.wasm alongside runtime.js in the same directory
BUILT_WASM="${REPO_ROOT}/src/modeler/solvers/highs/runtime.wasm"
if [ ! -f "${BUILT_WASM}" ]; then
  echo "Error: ${BUILT_WASM} was not generated!" >&2
  exit 1
fi

# Move optimized wasm from em++ to public/highs.wasm
mv "${BUILT_WASM}" "${OUTPUT_WASM}"

# Adjust locateFile in runtime.js so default location resolves to highs.wasm
# Emscripten findWasmBinary normally uses runtime.wasm when file is runtime.js.
# Replace runtime.wasm with highs.wasm in runtime.js:
sed -i '' 's/"runtime.wasm"/"highs.wasm"/g' "${OUTPUT_JS}" || sed -i 's/"runtime.wasm"/"highs.wasm"/g' "${OUTPUT_JS}"

# Sync hashes in highs.config.json if node is available
if command -v node >/dev/null 2>&1 && [ -f "${SCRIPT_DIR}/ensure-highs-wasm.mjs" ]; then
  node "${SCRIPT_DIR}/ensure-highs-wasm.mjs" --update-hashes
fi

echo "========================================================"
echo " HiGHS WebAssembly Build Complete!"
echo " JS Runtime: ${OUTPUT_JS} ($(ls -lh "${OUTPUT_JS}" | awk '{print $5}'))"
echo " WASM Asset: ${OUTPUT_WASM} ($(ls -lh "${OUTPUT_WASM}" | awk '{print $5}'))"
echo "========================================================"
