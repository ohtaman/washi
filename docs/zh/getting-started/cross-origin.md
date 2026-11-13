# 跨源隔离配置 (Z3 与浏览器环境)

在浏览器内运行 **Z3** 求解器时，需要配置跨源隔离（Cross-Origin Isolation）HTTP 响应头以启用 `SharedArrayBuffer`。

> [!TIP]
> **HiGHS、GLPK 与 Node.js 无需此配置**：内置默认的 **HiGHS** 与 **GLPK** 插件不使用 `SharedArrayBuffer`，在普通浏览器环境中即可直接运行；在 **Node.js** 中运行 Z3 也无需配置任何 HTTP 响应头。仅当在浏览器中使用 `@ohtaman/washi/solvers/z3` 时才需要参考本页。

---

## 为什么需要跨源隔离？

Z3 的 WebAssembly 构建版本使用基于 `SharedArrayBuffer` 与 Web Worker 的多线程（pthreads）机制。现代浏览器（Chrome、Firefox、Safari、Edge）为防范 Spectre 类侧信道攻击，默认禁用 `SharedArrayBuffer`，除非顶层文档开启了**跨源隔离**（`window.crossOriginIsolated === true`）。

---

## 必需的 HTTP 响应头

在返回顶层 HTML 文档时附带以下响应头：

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

若页面从外部域名加载子资源（如图片、脚本或 WASM 文件），这些响应还需包含 `Cross-Origin-Resource-Policy: cross-origin`（或 CORS 响应头）。

> [!NOTE]
> Chromium 与 Firefox 还支持 `Cross-Origin-Embedder-Policy: credentialless` 以放宽外部子资源的 CORP 要求，**但 Safari（macOS / iOS WebKit）不支持 `credentialless`**。如需兼容 Safari / iOS，请使用 `require-corp`。

---

## 各环境的配置方案

### 1. Vite (`vite.config.ts`)

同时为本地开发服务器（`vite`）与生产预览服务器（`vite preview`）配置响应头：

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

在 `public/_headers` 中创建规则文件，构建时会自动输出到站点根目录：

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

### 4. 自定义 Node.js / Express 服务器

```javascript
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
```

### 5. 无法自定义响应头的静态托管平台（如 GitHub Pages）

GitHub Pages 等平台不支持直接自定义 HTTP 响应头。此时可使用 **`coi-serviceworker`** 通过客户端 Service Worker 注入隔离响应头：

1. 将 `coi-serviceworker.js` 放置在站点根目录。
2. 在 HTML `<head>` 中引入：

```html
<script src="/coi-serviceworker.js"></script>
```

首次访问时 Service Worker 会完成注册并自动刷新页面一次，使 `window.crossOriginIsolated === true` 生效。

---

## WaSHI 的运行时检测

WaSHI 的 Z3 适配器在浏览器端初始化前会自动检测 `crossOriginIsolated`。若未启用跨源隔离，`solve()` / `check()` 会立即返回清晰的错误提示（说明需配置 COOP/COEP 响应头或使用 Service Worker），而不会静默挂起。
