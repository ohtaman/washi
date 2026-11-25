# Runtime Environments & Deployment

WaSHI runs across JavaScript and TypeScript runtimes and deployment targets without native solver compilation. Supported targets include Node.js, Bun, Deno, modern bundlers, static hosting, classic `<script>` tags, and offline WebView apps.

| Target Environment | Entry Point | Worker & Header Notes |
| --- | --- | --- |
| **Node.js (v18+), Bun, Deno** | `@ohtaman/washi` (`npm:@ohtaman/washi` in Deno) | Loads bundled `.wasm` from disk; no HTTP headers required. |
| **Vite, Next.js, Webpack, Rollup** | `@ohtaman/washi` | Runs HiGHS and Pumpkin in Web Workers by default. |
| **Tauri, Capacitor, PWA** | `@ohtaman/washi` (standard Vite build) | Runs offline; allow `'wasm-unsafe-eval'` in `script-src` and `worker-src 'self' blob:` (or pass `{ useWorker: false }`) in your Content Security Policy (`CSP`). |
| **Browser ESM (`<script type="module">`)** | `dist/browser/washi.js` | Keep all `dist/browser/` files together when self-hosting. |
| **Standalone HTML / CDN (`<script>`)** | `dist/browser/washi.min.js` | Exposes `window.Washi`; CDN builds also run directly on `file://`. |

---

## 🟢 Node.js, Bun & Deno

### Node.js

WaSHI supports Node.js 18+ with standard ECMAScript Modules (`ESM`). Both bundled WebAssembly engines—HiGHS (default) and Pumpkin (`{ solver: "pumpkin" }`)—load directly from `solvers/` inside the installed package with zero extra imports:

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("NodeExample");
const x = m.continuous("x", { lb: 0, ub: 10 });
const y = m.continuous("y", { lb: 0, ub: 20 });

m.objective(maximize(expr`2 * ${x} + 3 * ${y}`));
m.constraint(expr`${x} + ${y} <= 15`, "capacity");

await m.solve();
if (m.hasPrimalSolution) {
  console.log(`Status: ${m.status}, Objective: ${m.objectiveValue}`);
  console.log(`x = ${x.value}, y = ${y.value}`);
}
```

Run TypeScript files directly with `tsx` (or compiled `.js` with `node`):

```bash
npx tsx app.ts
```

### Bun & Deno

```bash
# Bun
bun add @ohtaman/washi
bun run app.ts
```

In Deno (v1.30+ with `npm:` specifiers):

```typescript
import { Model, maximize } from "npm:@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0, ub: 10 });
m.objective(maximize(x));
await m.solve();
if (m.hasPrimalSolution) {
  console.log("x =", x.value);
}
```

---

## 🌐 Bundlers & Static Hosting (Vite, Next.js, Webpack, Rollup)

### Modern Bundlers & Static Deployment

The package root export (`@ohtaman/washi`) resolves `import` and `default` to `./dist/lib/washi.js` (and `types` to `./dist/types/index.d.ts`). That unified ESM bundle detects Node.js versus browser runtimes automatically at execution time:

```typescript
import { Model, maximize } from "@ohtaman/washi";

export async function runOptimization() {
  const m = new Model({ solver: "highs" });
  const x = m.continuous("x", { lb: 0, ub: 100 });
  m.objective(maximize(x));
  await m.solve();
  return m.hasPrimalSolution ? x.value : null;
}
```

Because the modeler (JS/TS) and bundled solvers (WebAssembly) execute entirely on the client, static builds from `vite build` deploy directly to **GitHub Pages, Cloudflare Pages, Vercel, or Netlify** without a backend server. HiGHS, Pumpkin, and GLPK need no special HTTP headers; for Z3's browser headers, see **Offline, Intranet & Strict CSP Environments** below.

#### Background Web Worker Execution (Default)

In browsers, **HiGHS** and **Pumpkin** run inside dedicated Web Workers by default. This keeps the main UI thread responsive during `LP`, `MIP`, `QP`, and `CP` solves while enabling `onProgress` callbacks and `AbortSignal` cancellation.

Pass `useWorker: false` if your environment prohibits Web Workers or you prefer main-thread execution:

```typescript
await m.solve({ useWorker: false });
```

#### Customizing WASM Asset URLs

By default, WaSHI resolves `solvers/highs.wasm` and `solvers/pumpkin.wasm` relative to the bundle via `import.meta.url`. It **never** falls back to external CDNs (`jsDelivr`, `unpkg`, etc.).

If your browser host serves `.wasm` files from a custom path, override the URL globally or per call. For HiGHS, `setHighsWasmUrl()` (from `@ohtaman/washi/solvers/highs`) and `{ wasmUrl }` are browser-only (ignored in Node.js); Pumpkin (`setPumpkinWasmUrl()` from `@ohtaman/washi/solvers/pumpkin`) also accepts `file://` URLs in Node.js, and Z3 uses `setZ3Assets()` or `{ z3JsUrl, z3WasmUrl }`:

```typescript
import { setHighsWasmUrl } from "@ohtaman/washi/solvers/highs";
import { setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";
import { setZ3Assets } from "@ohtaman/washi/solvers/z3"; // Optional Z3 plugin

// Option A: Configure globally before solving
setHighsWasmUrl("/assets/wasm/highs.wasm");
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
setZ3Assets({ jsUrl: "/assets/z3/z3-built.js", wasmUrl: "/assets/z3/z3-built.wasm" });

// Option B: Configure per solve / check call
await m.solve({ wasmUrl: "/assets/wasm/highs.wasm" });
// For Z3: await m.check({ solver: "z3", z3JsUrl: "...", z3WasmUrl: "..." });
```

### Next.js & Server-Side Rendering (SSR)

In Next.js App Router or Pages Router, models run either on the server (Server Actions / API Routes) or in the browser inside `"use client"` components. Below is a client component example:

```tsx
"use client";

import { useState } from "react";
import { Model, maximize } from "@ohtaman/washi";

export default function OptimizerComponent() {
  const [val, setVal] = useState<number | null>(null);

  const handleSolve = async () => {
    const m = new Model();
    const x = m.continuous("x", { lb: 0, ub: 50 });
    m.objective(maximize(x));
    await m.solve();
    if (m.hasPrimalSolution) {
      setVal(x.value);
    }
  };

  return (
    <div>
      <button onClick={handleSolve}>Run Optimization</button>
      {val !== null && <p>Result: {val}</p>}
    </div>
  );
}
```

### Desktop & Mobile WebView Apps (Tauri / Capacitor / PWA)

Standard Vite frontends bundle **HiGHS** and **Pumpkin** as static assets for offline execution. They run in Tauri (`tauri://localhost` or `http://tauri.localhost`), Capacitor mobile WebViews, and offline PWAs with no native solver build step.

In `tauri.conf.json`, include `'wasm-unsafe-eval'` and `worker-src 'self' blob:` in your `CSP` string. If you run on the main thread with `{ useWorker: false }`, you can omit `worker-src` (see the full CSP table below):

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:"
    }
  }
}
```

Prefer bundled HiGHS and Pumpkin in WebViews to avoid Z3's [Cross-Origin Isolation](./cross-origin.md) requirements.

---

## 📦 Browser ESM (`<script type="module">`)

Without a bundler, import the pre-built browser ESM module from your own static server or an npm CDN:

```html
<script type="module">
  // From an npm CDN (or "./dist/browser/washi.js" when self-hosted; includes HiGHS and Pumpkin):
  import { Model, expr, maximize } from "https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.js";
  // Optional solver plugins:
  // import "https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/solvers/glpk.js";
  // import "https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/solvers/z3.js";

  const m = new Model("BrowserESM");
  const x = m.integer("x", { lb: 0, ub: 100 });
  const y = m.integer("y", { lb: 0, ub: 100 });

  m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
  m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");
  m.constraint(expr`2 * ${x} + ${y} <= 50`, "labor");

  await m.solve();
  if (m.hasPrimalSolution) {
    console.log("Optimal Objective:", m.objectiveValue);
  }
</script>
```

---

## 🟨 Classic `<script>` Tags (IIFE / Standalone HTML / CDN)

For single-file HTML pages, CodePen, or JSFiddle, load `washi.min.js` via a classic `<script>` tag. This immediately invoked function expression (`IIFE`) bundle exposes the core API on the global `window.Washi` object:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>WaSHI Browser Demo</title>
  </head>
  <body>
    <h1>WaSHI Browser Optimization</h1>
    <pre id="output">Solving...</pre>

    <!-- Core WaSHI + bundled HiGHS & Pumpkin (MIT) via CDN (or "./dist/browser/washi.min.js" when self-hosted) -->
    <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js"></script>
    <!-- Optional plugins (load after washi.min.js; auto-register when window.Washi is present): -->
    <!-- <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/solvers/glpk.min.js"></script> -->
    <!-- <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/solvers/z3.min.js"></script> -->

    <script>
      (async () => {
        const { Model, expr, maximize } = Washi;

        const m = new Model("BrowserDemo");
        const x = m.continuous("x", { lb: 0, ub: 10 });
        const y = m.continuous("y", { lb: 0, ub: 20 });

        m.objective(maximize(expr`2 * ${x} + 3 * ${y}`));
        m.constraint(expr`${x} + ${y} <= 15`);

        await m.solve();

        if (m.hasPrimalSolution) {
          document.getElementById("output").textContent =
            `Status: ${m.status}\n` +
            `Objective: ${m.objectiveValue}\n` +
            `x = ${x.value}, y = ${y.value}`;
        }
      })();
    </script>
  </body>
</html>
```

### Cross-Origin CDN Workers

On standard `http://` and `https://` origins, browsers block direct `new Worker("https://cdn...")` calls. WaSHI automatically bridges cross-origin CDN workers with a small ES module `Blob` bootstrap.

### Opening Local `.html` Files Directly (`file://`)

| Scenario | Behavior & Requirement |
| --- | --- |
| **CDN scripts** | Loading `washi.min.js` from an HTTPS CDN includes both HiGHS and Pumpkin and works by double-clicking a local `.html` file (`file://`) with no local server. |
| **Opaque origins (`window.origin === "null"`)** | On `file://` pages or sandboxed `<iframe>` embeds without `allow-same-origin`, WaSHI runs HiGHS and Pumpkin on the main thread when `useWorker` is omitted. |
| **Self-hosted `.wasm` & Z3** | Local `.wasm` files require `http://` or `https://` because browsers block `fetch()` on `file://`. Z3 also requires Cross-Origin Isolation (see below). |

---

## 🔒 Offline, Intranet & Strict CSP Environments

WaSHI never phones home or falls back to public CDNs. To self-host in an air-gapped intranet or under a strict `CSP`, configure three areas:

### 1. Deploy `dist/browser/` Intact

Copy `node_modules/@ohtaman/washi/dist/browser/` to your static origin as a complete directory. Even the classic IIFE bundle (`washi.min.js`) spawns `solvers/highs-worker.js` and `solvers/pumpkin-worker.js` as Web Workers by default unless `{ useWorker: false }` is passed. Both the ESM entry points and these worker scripts import hashed `*.js` chunks under `dist/browser/` via relative paths.

| Bundle | Required Files under `dist/browser/` |
| --- | --- |
| **Core** | `washi.js` / `washi.min.js` |
| **Bundled HiGHS** | `solvers/highs.js`, `solvers/highs.wasm`, `solvers/highs-worker.js`, and `solvers/highs-*.js` chunks |
| **Bundled Pumpkin** | `solvers/pumpkin.js`, `solvers/pumpkin.wasm`, `solvers/pumpkin-worker.js`, and `solvers/pumpkin-*.js` chunks |
| **Optional GLPK** | `solvers/glpk.js` / `solvers/glpk.min.js` |
| **Optional Z3** | `solvers/z3.js` / `solvers/z3.min.js`, `solvers/z3-built.js`, `solvers/z3-built.wasm` |

### 2. Configure CSP Directives

| Directive | Required Value | Purpose |
| --- | --- | --- |
| `script-src` | `'wasm-unsafe-eval'` | Allows WebAssembly module compilation. |
| `worker-src` | `'self' blob:` | Allows default Web Workers and CDN `Blob` worker bootstraps. |
| `worker-src` (if `blob:` is disallowed) | `'self'` only | Serve `solvers/highs-worker.js` / `solvers/pumpkin-worker.js` from `'self'`, or pass `{ useWorker: false }`. |

### 3. Enable Cross-Origin Isolation (Z3 Only)

HiGHS, Pumpkin, and GLPK run in standard browser contexts without isolation headers. Z3 uses `SharedArrayBuffer` multithreading, so browsers require a **Secure Context** (`https://` or `http://localhost`). You must also serve `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers (`COOP`/`COEP`); see the [Cross-Origin Isolation Guide](./cross-origin.md).
