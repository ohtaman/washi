# Cross-Origin Isolation (Z3 & Browsers)

Running the Z3 solver in a browser requires two browser security conditions: a **Secure Context** and **Cross-Origin Isolation**. Together, they enable `SharedArrayBuffer` for Z3's multithreaded WebAssembly build.

> [!TIP]
> **Not needed for HiGHS, Pumpkin, GLPK, or Node.js**: Bundled HiGHS and Pumpkin, as well as the GLPK plugin, never use `SharedArrayBuffer` and work in standard browser contexts. Running Z3 in Node.js also requires no HTTP headers. You only need this guide when using `@ohtaman/washi/solvers/z3` in a browser.

---

## Why Are These Preconditions Required?

Z3's WebAssembly binary uses POSIX threads (`pthreads`) backed by `SharedArrayBuffer` and Web Workers. To mitigate Spectre-style side-channel attacks, modern browsers disable `SharedArrayBuffer` by default.

Browsers re-enable `SharedArrayBuffer` only when both conditions hold on the top-level document:

1. **Secure Context**: The page must load over `https://` or `http://localhost` (`window.isSecureContext === true`). Plain `http://` LAN IP addresses do not qualify.
2. **Cross-Origin Isolation**: The document must opt into isolation headers so `window.crossOriginIsolated === true`.

---

## Required HTTP Response Headers

Serve the top-level HTML document with these two response headers:

- **Cross-Origin-Opener-Policy (`COOP`)**: `same-origin`
- **Cross-Origin-Embedder-Policy (`COEP`)**: `require-corp`

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

If your page loads scripts, images, or `.wasm` files from another origin, those responses must include `Cross-Origin-Resource-Policy: cross-origin` (`CORP`) or valid CORS headers (`Access-Control-Allow-Origin`), depending on the request mode.

> [!NOTE]
> Chromium and Firefox also accept `Cross-Origin-Embedder-Policy: credentialless`, which relaxes `CORP` requirements on cross-origin subresources. **Safari (WebKit) does not support `credentialless`**, so use `require-corp` if you support Safari or iOS.

---

## Setup by Environment

### 1. Vite (`vite.config.ts`)

Configure both the `vite` dev server and `vite preview` server:

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

Place a `_headers` file in `public/` so your build copies it to the site root:

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

### 4. Express (Custom Node.js Server)

```javascript
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
```

### 5. Static Hosting without Header Control (e.g., GitHub Pages)

Platforms like GitHub Pages do not let you customize HTTP response headers. You can use **`coi-serviceworker`** to inject `COOP` and `COEP` headers from a client-side Service Worker. Note that Service Workers themselves also require a Secure Context (`https://` or `http://localhost`).

1. Copy `coi-serviceworker.js` from [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) or WaSHI's reference [`public/coi-serviceworker.js`](https://github.com/ohtaman/washi/blob/main/public/coi-serviceworker.js) to your site root.
2. Load it in your HTML `<head>`:

```html
<script src="/coi-serviceworker.js"></script>
```

On the first visit, the Service Worker registers and reloads the page once so `window.crossOriginIsolated` becomes `true`.

---

## Runtime Check in WaSHI

Before initializing Z3 in a browser, WaSHI validates both preconditions in order:

| Check | Failure Condition | Result |
| --- | --- | --- |
| **Secure Context** | `!window.isSecureContext` and hostname is not `localhost`, `127.0.0.1`, or `[::1]` | `solve()` / `check()` immediately rejects with an HTTPS or `localhost` requirement error. |
| **Cross-Origin Isolation** | `SharedArrayBuffer` is missing or `window.crossOriginIsolated !== true` | `solve()` / `check()` immediately rejects listing the required `COOP` and `COEP` headers instead of hanging. |
