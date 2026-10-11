# Browser distribution examples

These complete HTML files demonstrate WaSHI and its solver plugins in browser environments with no external bundlers required.

From the repository root:

```sh
npm run build:browser
cp -R dist/browser examples/distribution/washi
python3 -m http.server 8000 --directory examples/distribution
```

### Available Examples:
- **`esm.html`**: Core HiGHS engine using modern browser ESM (`import { Model } from "./washi/washi.js"`).
- **`script.html`**: Core HiGHS engine using classic `<script src="./washi/washi.min.js">` (exposes `window.Washi`).
- **`glpk-esm.html`**: GLPK MIP solver plugin via ESM (`import "./washi/solvers/glpk.js"`).
- **`glpk-script.html`**: GLPK MIP solver plugin via `<script src="./washi/solvers/glpk.min.js">`.
- **`z3-esm.html`**: Z3 SMT solver plugin via ESM (`import "./washi/solvers/z3.js"`).

Keep the entire `washi/` directory (including `solvers/` subdirectory, JS, Workers, and WASM) together.

---

## CodePen & Third-Party Embeds

### 1. HiGHS Core & GLPK
HiGHS and GLPK run smoothly in standard CodePen pens or iframes using CDN URLs.

> [!NOTE]
> The modular solver plugins under `dist/browser/solvers/` (`glpk.min.js`, `z3.min.js`) are available starting from version `>= 0.2.0` (or `@latest`). Prior releases like `@0.1.2` only contained the core HiGHS bundle (`dist/browser/washi.min.js`). For local testing with files in this directory, serve `./washi/...` from a local HTTP server.

In **Settings → JavaScript → External Scripts** (pin to `>= 0.2.0` or `@latest`):
```text
https://cdn.jsdelivr.net/npm/@ohtaman/washi@latest/dist/browser/washi.min.js
https://cdn.jsdelivr.net/npm/@ohtaman/washi@latest/dist/browser/solvers/glpk.min.js
```

In the JS panel:
```javascript
const { Model } = window.Washi;
const model = new Model({ solver: "glpk" });
```

### 2. Z3 Browser Engine Requirement
The Z3 theorem prover runs as a multithreaded WebAssembly engine utilizing `SharedArrayBuffer`. Browsers mandate **Cross-Origin Isolation** for SharedArrayBuffer security.

Therefore, your hosting server or local development server must return the following HTTP response headers on the HTML document:
```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

> **Note on CodePen / JSFiddle**: Standard third-party iframe embeds without custom response headers do not enable `crossOriginIsolated`, so Z3 cannot run inside standard CodePen preview iframes. For Z3, run locally or host on a server with COOP/COEP headers configured.

