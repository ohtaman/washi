# 跨源隔离配置（Z3 与浏览器环境）

在浏览器中运行 Z3 求解器需要同时满足两项浏览器安全前提：**安全上下文**与**跨源隔离**。只有两者同时成立，浏览器才会为 Z3 的多线程 WebAssembly 启用 `SharedArrayBuffer`。

> [!TIP]
> **HiGHS、Pumpkin、GLPK 与 Node.js 无需此配置**：内置的 HiGHS 与 Pumpkin，以及 GLPK 插件均不使用 `SharedArrayBuffer`，在普通浏览器上下文中即可运行。在 Node.js 中运行 Z3 也无需任何 HTTP 响应头。仅当在浏览器中使用 Z3 时需要参考本页。

---

## 为什么需要这两项前提条件？

Z3 的 WebAssembly 二进制文件依赖由 `SharedArrayBuffer` 与 Web Worker 支撑的 POSIX 线程（`pthreads`）。为防范 Spectre 类侧信道攻击，现代浏览器默认禁用 `SharedArrayBuffer`。

只有在顶层文档同时满足以下两个条件时，浏览器才会重新启用 `SharedArrayBuffer`：

1. **安全上下文**：页面必须通过 `https://` 或 `http://localhost`（包括 `127.0.0.1` 与 `[::1]`）加载，使 `window.isSecureContext === true`。普通的 `http://` 局域网 IP 地址不满足条件。
2. **跨源隔离**：文档必须附带隔离响应头，使 `window.crossOriginIsolated === true`。

---

## 必需的 HTTP 响应头

为顶层 HTML 文档配置以下两项响应头：

- **Cross-Origin-Opener-Policy（`COOP`）**：`same-origin`
- **Cross-Origin-Embedder-Policy（`COEP`）**：`require-corp`

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

如果页面从其他源加载脚本、图片或 `.wasm` 文件，这些资源的响应需根据请求模式附带 `Cross-Origin-Resource-Policy: cross-origin`（`CORP`）或有效的 CORS 响应头（`Access-Control-Allow-Origin`）。

> [!NOTE]
> Chromium 与 Firefox 也支持 `Cross-Origin-Embedder-Policy: credentialless`，可放宽外部子资源的 `CORP` 要求。但 **Safari（WebKit）不支持 `credentialless`**，如需兼容 Safari 或 iOS，请使用 `require-corp`。

---

## 各环境的配置方案

### 1. Vite（`vite.config.ts`）

同时为 `vite` 开发服务器和 `vite preview` 预览服务器配置响应头：

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

### 2. Cloudflare Pages / Netlify（`public/_headers`）

在 `public/` 下放置 `_headers` 文件，构建时会自动复制到站点根目录：

```text
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

### 3. Next.js（`next.config.js`）

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

### 4. Express（自定义 Node.js 服务器）

```javascript
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
```

### 5. 无法自定义响应头的静态托管平台（如 GitHub Pages）

GitHub Pages 等平台不允许直接修改 HTTP 响应头。您可以使用 **`coi-serviceworker`** 通过客户端 Service Worker 注入 `COOP` 与 `COEP` 响应头。请注意，Service Worker 本身同样需要安全上下文（`https://` 或 `http://localhost`）。

1. 从 [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) 复制 `coi-serviceworker.js`，或复制 WaSHI 的 [`public/coi-serviceworker.js`](https://github.com/ohtaman/washi/blob/main/public/coi-serviceworker.js) 到站点根目录。
2. 在 HTML `<head>` 中引入该脚本：

```html
<script src="/coi-serviceworker.js"></script>
```

首次访问时，Service Worker 会完成注册并刷新页面一次，使 `window.crossOriginIsolated` 变为 `true`。

---

## WaSHI 的运行时检测

在浏览器中初始化 Z3 前，WaSHI 会按顺序校验两项前提条件：

| 检测项 | 失败条件 | 行为 |
| --- | --- | --- |
| **安全上下文** | `!window.isSecureContext` 且主机名非 `localhost` / `127.0.0.1` / `[::1]` | `solve()` 与 `check()` 返回的 Promise 会立即 reject，并提示需要 HTTPS 或 `localhost`。 |
| **跨源隔离** | `SharedArrayBuffer` 不可用或 `window.crossOriginIsolated !== true` | `solve()` 与 `check()` 返回的 Promise 会立即 reject，列出所需的 `COOP` 与 `COEP` 响应头，而不会静默挂起。 |
