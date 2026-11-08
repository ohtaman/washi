# Contributing & Maintainer Guide

Thank you for your interest in contributing to **WaSHI** (`@ohtaman/washi`). This guide covers local development, testing, reproducible benchmarks, WebAssembly asset builds, and the release workflow.

For pull request and code review standards, see [`AGENTS.md`](./AGENTS.md).

---

## 1. Local Development & Running Examples

Clone the repository and install dependencies:

```bash
git clone https://github.com/ohtaman/washi.git
cd washi
npm ci
```

Run Node.js examples or start the local browser playground:

```bash
# Run a Node.js example against src/
npx tsx examples/node/01-production-planning.ts

# Start the local browser demo playground (http://localhost:5173/demo/)
npm run dev
```

---

## 2. Testing & Building

```bash
# Run unit and integration tests
npm test

# Build production distributions (Node.js, browser bundles, and TypeScript declarations)
npm run build

# Regenerate llms.txt and llms-full.txt from docs/
npm run build:llms
```

---

## 3. Reproducible Benchmarks

To measure modeling and solver phases on deterministic `small-lp` (24 variables, 18 constraints) and `scheduling-mip` (315 variables, 231 constraints, including rebuilt `initialValue` warm starts) scenarios without mixing performance timings into correctness test thresholds:

```bash
# Run Node.js in-process WASM benchmarks (HiGHS and GLPK, 5 warm iterations by default)
npm run bench

# Customize iteration count or emit structured JSON
node scripts/run-benchmarks.mjs --iterations=10 --json

# Also measure headless Chromium Web Worker execution (requires Playwright Chromium)
node scripts/run-benchmarks.mjs --browser
```

- **Explicit phase boundaries**: Reports cold runtime initialization (`coldRuntimeInitMs`, `coldFirstSolveMs`) separately from repeated warm-runtime measurements (`modelBuildMs`, `validationMs`, `lpSerializationMs` for LP-string adapters or `symbolMapMs` for structured adapters, `resultMappingMs` via `MockSolver`, `adapterSolveMs`, and `endToEndSolveMs`). Timings are measured directly per phase and are never subtracted to estimate "native solver time".
- **Distinct execution environments**: Node.js in-process WASM (`usesBrowserWorker: false`) and Browser Web Worker execution (`usesBrowserWorker: true`, which includes Worker lifecycle and `postMessage` structured-clone transfer) are reported as separate environments, not interchangeable baselines.

---

## 4. Rebuilding HiGHS WebAssembly & Release Workflow

### Rebuilding / Updating HiGHS WebAssembly Assets (`highs.config.json`)

```bash
# Compile ERGO-Code/HiGHS to public/highs.wasm + runtime.js and update SHA-256 hashes in highs.config.json
npm run build:highs-wasm

# After merging to main, upload the updated assets to the highs-<version> GitHub Release tag
# so on-demand downloads (scripts/ensure-highs-wasm.mjs) match highs.config.json SHA-256 hashes:
gh release upload highs-v1.15.1 public/highs.wasm src/modeler/solvers/highs/runtime.js --clobber
```

Alternatively, trigger the **Build HiGHS WebAssembly** workflow (`.github/workflows/build-wasm.yml`) via `workflow_dispatch` with `create_release: true`, then download the `highs-wasm-assets` workflow artifact (`public/highs.wasm`, `src/modeler/solvers/highs/runtime.js`, and `highs.config.json`) and commit those updated files to `main` so repository checksums stay synchronized with the published Release assets.

### Publishing `@ohtaman/washi` to npm

- Merging to `main` automatically deploys the updated documentation and web demo to GitHub Pages (`.github/workflows/deploy-demo.yml`), but does **not** publish to npm automatically.
- To publish a new version to npm, bump `"version"` in `package.json` on `main` and publish a GitHub Release (e.g., `gh release create v0.6.0 --generate-notes`). Publishing the GitHub Release triggers `.github/workflows/publish-npm.yml`, which runs unit and Playwright distribution checks before publishing to npm via OIDC Trusted Publishing.
