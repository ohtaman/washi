# 跨源隔离配置 (Z3 与浏览器环境)

在浏览器内运行 **Z3** 求解器引擎时，由于浏览器的安全模型限制，需要配置特定的 HTTP 响应头。

---

## 为什么需要跨源隔离 (Cross-Origin Isolation)？

Z3 的 WebAssembly 引擎底层依赖基于 `SharedArrayBuffer` 和 Web Worker 的多线程（pthreads）机制。

在现代浏览器（Chrome、Firefox、Safari、Edge）中，为了缓解类似 Spectre 的时序侧信道攻击，`SharedArrayBuffer` 默认处于禁用状态。要重新启用它，托管页面必须处于**跨源隔离（Cross-Origin Isolated）**状态。

---

## 必需的 HTTP 响应头

要建立跨源隔离，您的 Web 服务器在返回顶层 HTML 文档时必须附带以下 HTTP 响应头：

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

此外，从外部域名加载的任何跨源资源（例如脚本或 WASM 文件）必须附带：

```http
Cross-Origin-Resource-Policy: cross-origin
```

---

## 各托管环境的配置方案

### 1. 自定义 Node.js / Express 服务器

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

### 3. 无法自定义响应头的静态托管平台（如 GitHub Pages）

GitHub Pages 或部分预览环境不支持直接自定义 HTTP 响应头。

在这些环境中，您可以使用 **`coi-serviceworker`**（一个在客户端通过 Service Worker 注入隔离响应头的轻量级脚本）：

1. 将 `coi-serviceworker.js` 放置在网站根目录下。
2. 在 HTML 的 `<head>` 中引入：

```html
<script src="/coi-serviceworker.js"></script>
```

当用户首次访问时，Service Worker 会完成注册并自动刷新页面一次，从而使 `window.crossOriginIsolated === true` 生效。

---

## WaSHI 的运行时检测与优雅降级

WaSHI 的 Z3 求解器适配器会在运行时自动检查当前环境。如果在未启用跨源隔离的浏览器中调用 Z3，它会立即以清晰、具体的错误信息 reject Promise（提示需要配置 COOP/COEP 响应头或使用 Service Worker），而不会静默挂起。

> [!TIP]
> 默认的 **HiGHS** 求解器引擎以及 **GLPK** 求解器不需要跨源隔离或 `SharedArrayBuffer`，在标准浏览器上下文中即可开箱即用。
