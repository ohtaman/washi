# Cross-Origin Isolation (Z3 & Browsers)

When running the **Z3** solver engine inside a web browser, special HTTP headers are required due to browser security models.

---

## Why is Cross-Origin Isolation Required?

The Z3 WebAssembly engine utilizes multithreading backed by `SharedArrayBuffer` and Web Workers.

In modern browsers (Chrome, Firefox, Safari, Edge), `SharedArrayBuffer` is disabled by default to mitigate Spectre-style timing side-channel attacks. To re-enable it, the hosting page must be **Cross-Origin Isolated**.

---

## Required HTTP Response Headers

To establish cross-origin isolation, your web server must serve the top-level HTML document with the following HTTP headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

In addition, any cross-origin assets (e.g. scripts or WASM files loaded from external domains) must send:

```http
Cross-Origin-Resource-Policy: cross-origin
```

---

## Solutions by Hosting Environment

### 1. Custom Node.js / Express Server

```javascript
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
```

### 2. Next.js (`next.config.js`)

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

### 3. Static Hosting without Header Control (e.g., GitHub Pages)

Platforms like GitHub Pages or preview environments do not allow customizing response headers directly.

For these environments, you can use **`coi-serviceworker`** (a lightweight Service Worker that injects isolation headers on the client side):

1. Place `coi-serviceworker.js` in your website root.
2. In your HTML `<head>`, include:

```html
<script src="/coi-serviceworker.js"></script>
```

When a user visits for the first time, the service worker registers and reloads the page once to establish `window.crossOriginIsolated === true`.

---

## Graceful Degradation in WaSHI

WaSHI's Z3 solver adapter automatically inspects the environment at runtime. If Z3 is invoked in a browser lacking cross-origin isolation, it immediately rejects with a clear, informative error message explaining that COOP/COEP headers or a service worker are required, rather than hanging silently.

> [!TIP]
> The default **HiGHS** solver engine does not require cross-origin isolation or `SharedArrayBuffer`. It works out of the box in standard browser contexts.
