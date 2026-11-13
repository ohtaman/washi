# Runtime Environments & Deployment

WaSHI runs across JavaScript and TypeScript runtimes—from Node.js, Bun, and Deno to modern bundlers, static hosting, and vanilla browser `<script>` tags—without native C/C++ compilation.

---

## 🟢 Node.js, Bun & Deno

### Node.js

WaSHI supports Node.js (v18+) out of the box with standard ECMAScript Modules (ESM). The built-in HiGHS WebAssembly binary is loaded directly from the installed package:

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

Run directly with `tsx` or `node`:

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

When importing `@ohtaman/washi` in a browser bundler, the `browser` export condition resolves automatically:

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

export async function runOptimization() {
  const m = new Model({ solver: "highs" });
  const x = m.continuous("x", { lb: 0, ub: 100 });
  m.objective(maximize(x));
  await m.solve();
  return m.hasPrimalSolution ? x.value : null;
}
```

Because both the modeler and solver run on WebAssembly, the static output of `vite build` (or your bundler's production build) can be deployed directly to **GitHub Pages, Cloudflare Pages, Vercel, or Netlify** with no backend server required. (The default HiGHS and GLPK solvers require no special HTTP headers; if you use Z3 in the browser, see [Cross-Origin Isolation](./cross-origin.md).)

#### Background Web Worker Execution (Default)
In browsers, HiGHS automatically runs inside a dedicated **Web Worker** so LP/MIP/QP solves never freeze the main UI thread, animations, or user input, while enabling real-time progress events (`onProgress`) and cancellation (`AbortSignal`).

If your environment prohibits Web Workers or you explicitly want main-thread execution, pass `useWorker: false`:

```typescript
await m.solve({ useWorker: false });
```

#### Customizing the HiGHS WASM Asset URL
By default, WaSHI resolves `highs.wasm` relative to the bundle (`new URL("./highs.wasm", import.meta.url)`). It **never** makes implicit requests to external CDNs (`jsdelivr`, `unpkg`, etc.).

If your bundler or static server hosts `.wasm` files under a custom path, configure the URL globally or per solve:

```typescript
import { setHighsWasmUrl } from "@ohtaman/washi";

// Option A: Configure globally before solving
setHighsWasmUrl("/assets/wasm/highs.wasm");

// Option B: Configure per solve call
await m.solve({ wasmUrl: "/assets/wasm/highs.wasm" });
```

### Next.js & Server-Side Rendering (SSR)

In Next.js App Router or Pages Router, optimization models can run either in Server Actions / API Routes (Node.js runtime) or on the client inside `"use client"` components:

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

---

## 📦 Browser ESM (`<script type="module">`)

Without a bundler, you can import the pre-built browser ESM module directly from your own static server or an npm CDN:

```html
<script type="module">
  // From an npm CDN (or "./dist/browser/washi.js" when self-hosted):
  import { Model, expr, maximize } from "https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.6/dist/browser/washi.js";
  // Optional solver plugins:
  // import "https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.6/dist/browser/solvers/glpk.js";
  // import "https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.6/dist/browser/solvers/z3.js";

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

For single-file HTML pages, CodePen, or JSFiddle, load `washi.min.js` via a standard `<script>` tag. All exports are attached to the global `window.Washi` object:

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

    <!-- Core WaSHI + HiGHS (MIT) via CDN (or "./dist/browser/washi.min.js" when self-hosted) -->
    <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.6/dist/browser/washi.min.js"></script>
    <!-- Optional plugins (auto-register on window.Washi): -->
    <!-- <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.6/dist/browser/solvers/glpk.min.js"></script> -->
    <!-- <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.6/dist/browser/solvers/z3.min.js"></script> -->

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

> [!NOTE]
> When loading from a cross-origin CDN (such as jsDelivr or unpkg), browsers block direct `new Worker("https://cdn...")` construction under the same-origin policy. On standard web origins (`https://` / `http://`), WaSHI automatically bridges cross-origin workers via a lightweight ES module `Blob` bootstrap (`import "https://..."`). On opaque effective origins (`window.origin === "null"`, such as local `file:` URLs or `sandbox="allow-scripts"` `<iframe>` embeds without `allow-same-origin`), WaSHI automatically runs HiGHS on the main thread when `useWorker` is omitted.

---

## 🔒 Offline, Intranet & Strict CSP Environments

WaSHI never phones home or falls back to public CDNs. To self-host in an air-gapped intranet or under a strict Content Security Policy (CSP):

1. **Copy Static Assets**: Serve the files from `node_modules/@ohtaman/washi/dist/browser/` on your own origin:
   - `washi.js` / `washi.min.js`, `highs.wasm`, and `highs-worker.js`
   - Optional GLPK: `solvers/glpk.js` / `solvers/glpk.min.js`
   - Optional Z3: `solvers/z3.js` / `solvers/z3.min.js`, `solvers/z3-built.js`, `solvers/z3-built.wasm`
2. **Content Security Policy (CSP) Headers**:
   - Allow WebAssembly compilation (`'wasm-unsafe-eval'` in `script-src`).
   - If using the default Web Worker or cross-origin Blob worker bootstrap, allow `worker-src 'self' blob:;`.
   - If `blob:` workers are prohibited by policy, either serve `highs-worker.js` from `'self'` or run on the main thread with `await m.solve({ useWorker: false })`.
3. **Cross-Origin Isolation (Z3 Only)**:
   - HiGHS and GLPK run in standard browser contexts without special headers.
   - Z3 WASM uses pthreads + `SharedArrayBuffer` and requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (`credentialless` works in Chromium/Firefox, whereas Safari requires `require-corp`). See the [Cross-Origin Isolation Guide](./cross-origin.md) for setup details.
