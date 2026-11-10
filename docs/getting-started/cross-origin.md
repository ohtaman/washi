# Cross-Origin Isolation (Z3 & Browsers)

When running the **Z3** solver inside a web browser, Cross-Origin Isolation HTTP headers are required so the browser enables `SharedArrayBuffer`.

> [!TIP]
> **Not needed for HiGHS, GLPK, or Node.js**: The built-in **HiGHS** solver and **GLPK** plugin run in standard browser contexts without Cross-Origin Isolation or `SharedArrayBuffer`. Running Z3 in **Node.js** also requires no HTTP headers. You only need this page when using `@ohtaman/washi/solvers/z3` in the browser.

---

## Why is Cross-Origin Isolation Required?

Z3's WebAssembly build uses multithreading (pthreads) backed by `SharedArrayBuffer` and Web Workers. Modern browsers (Chrome, Firefox, Safari, Edge) disable `SharedArrayBuffer` by default to mitigate Spectre-style side-channel attacks unless the top-level document opts into **Cross-Origin Isolation** (`window.crossOriginIsolated === true`).

---

## Required HTTP Response Headers

Serve the top-level HTML document with:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

If your page loads cross-origin subresources (such as scripts, images, or WASM files from another domain), those responses must also include `Cross-Origin-Resource-Policy: cross-origin` (or CORS headers).

> [!NOTE]
> Chromium and Firefox also support `Cross-Origin-Embedder-Policy: credentialless`, which relaxes subresource CORP requirements, **but Safari (WebKit) does not support `credentialless`**. Use `require-corp` if you support Safari / iOS.

---

## Setup by Environment

### 1. Vite (`vite.config.ts`)

Configure both the local dev server (`vite`) and production preview server (`vite preview`):

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
```

### 2. Cloudflare Pages / Netlify (`public/_headers`)

Place a `_headers` file in `public/` so it is copied to the root of your build output:

```text
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

### 3. Next.js (`next.config.js`)

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

### 4. Custom Node.js / Express Server

```javascript
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
```

### 5. Static Hosting without Header Control (e.g., GitHub Pages)

Platforms like GitHub Pages do not allow customizing HTTP response headers directly. You can use **`coi-serviceworker`** to inject the isolation headers via a client-side Service Worker:

1. Place `coi-serviceworker.js` at your site root.
2. Load it in your HTML `<head>`:

```html
<script src="/coi-serviceworker.js"></script>
```

On the first visit, the Service Worker registers and reloads the page once to establish `window.crossOriginIsolated === true`.

---

## Runtime Check in WaSHI

WaSHI's Z3 adapter checks `crossOriginIsolated` before initializing Z3 in the browser. If Cross-Origin Isolation is missing, `solve()` / `check()` immediately rejects with an actionable error explaining that COOP/COEP headers or a Service Worker are required, rather than hanging silently.
