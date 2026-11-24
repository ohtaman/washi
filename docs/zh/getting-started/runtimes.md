# 运行时环境与部署配置

WaSHI 无需本地 C/C++ 编译，即可跨多种 JavaScript 与 TypeScript 运行时工作。支持范围涵盖 Node.js、Bun、Deno、现代打包工具、静态托管、传统 `<script>` 标签以及离线 WebView 应用。

| 目标环境 | 入口点 | Worker 与响应头要点 |
| --- | --- | --- |
| **Node.js (v18+)、Bun、Deno** | `@ohtaman/washi`（Deno 使用 `npm:@ohtaman/washi`） | 直接从本地包加载 `.wasm`，无需 HTTP 响应头。 |
| **Vite、Next.js、Webpack、Rollup** | `@ohtaman/washi` | HiGHS 与 Pumpkin 默认在 Web Worker 中运行。 |
| **Tauri、Capacitor、PWA** | 标准 Vite 产物 | 支持离线运行；在内容安全策略（`CSP`）中允许 `'wasm-unsafe-eval'`。 |
| **浏览器 ESM（`<script type="module">`）** | `dist/browser/washi.js` | 自托管时请保留 `dist/browser/` 中的同级分块文件。 |
| **单文件 HTML / CDN（`<script>`）** | `dist/browser/washi.min.js` | 暴露全局 `window.Washi`；CDN 版可直接通过 `file://` 打开。 |

---

## 🟢 Node.js / Bun / Deno

### Node.js

WaSHI 原生支持 Node.js 18+ 的标准 ECMAScript Modules（`ESM`）。内置的 HiGHS 与 Pumpkin（`@ohtaman/washi/solvers/pumpkin`）WebAssembly 二进制文件会直接从已安装包中加载：

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

使用 `tsx` 或 `node` 直接运行：

```bash
npx tsx app.ts
```

### Bun & Deno

```bash
# Bun
bun add @ohtaman/washi
bun run app.ts
```

在 Deno（v1.30+，支持 `npm:` 标识符）中：

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

## 🌐 打包工具与静态托管 (Vite, Next.js, Webpack, Rollup)

### 现代打包工具与静态站点发布

包根导出（`@ohtaman/washi`）通过 `types`、`import` 与 `default` 条件解析到 `./dist/lib/washi.js`。该统一 ESM 产物会在运行时自动识别 Node.js 与浏览器环境：

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

建模器与求解器均基于 WebAssembly 运行。因此 `vite build` 的静态产物可直接部署到 GitHub Pages、Cloudflare Pages、Vercel 或 Netlify，无需后端服务。内置的 HiGHS、Pumpkin 与可选 GLPK 均无需特殊 HTTP 响应头。

#### 后台 Web Worker 执行（默认）

在浏览器中，**HiGHS** 与 **Pumpkin** 默认在专用 Web Worker 中执行。这样在求解 `LP`、`MIP`、`QP` 与 `CP` 模型时不会阻塞主 UI 线程，同时支持 `onProgress` 回调与 `AbortSignal` 取消。

如果环境限制使用 Web Worker 或希望在主线程执行，可传入 `useWorker: false`：

```typescript
await m.solve({ useWorker: false });
```

#### 自定义 WASM 资源 URL

默认情况下，WaSHI 通过 `import.meta.url` 相对打包产物解析 `highs.wasm` 与 `pumpkin.wasm`。它**绝不会**隐式回退到外部公共 CDN（如 `jsdelivr`、`unpkg` 等）。

如果服务器将 `.wasm` 文件放在自定义路径，可在全局或每次调用时覆写 URL：

```typescript
import { setHighsWasmUrl } from "@ohtaman/washi";
import { setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// 方式 A：在求解前全局配置
setHighsWasmUrl("/assets/wasm/highs.wasm");
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");

// 方式 B：在每次调用 solve / check 时单独配置
await m.solve({ wasmUrl: "/assets/wasm/highs.wasm" });
```

### Next.js 与服务端渲染 (SSR)

在 Next.js App Router 或 Pages Router 中，模型既可在服务端（Server Actions / API Routes）运行，也可在客户端 `"use client"` 组件内运行：

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

### 桌面端与移动端 WebView 应用 (Tauri / Capacitor / PWA)

标准 Vite 前端会将 **HiGHS** 与 **Pumpkin**（`@ohtaman/washi/solvers/pumpkin`）打包为静态资源以供离线运行。它们无需本地 C/C++ 编译，即可运行于 Tauri（`tauri://localhost` / `http://tauri.localhost`）、Capacitor 移动 WebView 与离线 PWA。

在 `tauri.conf.json` 中为 `CSP` 添加 WebAssembly 与 Web Worker 权限，或传入 `{ useWorker: false }`：

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:"
    }
  }
}
```

在 WebView 环境中，推荐优先使用内置的 HiGHS 与 Pumpkin，从而避开 Z3 的浏览器跨源隔离要求。

---

## 📦 浏览器 ESM (`<script type="module">`)

无需打包工具，即可直接从自托管静态服务器或 npm CDN 导入预构建的浏览器 ESM 模块：

```html
<script type="module">
  // 从 npm CDN 加载（自托管时可使用 "./dist/browser/washi.js"）：
  import { Model, expr, maximize } from "https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.js";
  // 内置或可选的求解器插件：
  // import "https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/solvers/pumpkin.js";
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

## 🟨 传统 `<script>` 标签 (IIFE / 单文件 HTML / CDN)

对于单文件 HTML 页面、CodePen 或 JSFiddle，可通过传统 `<script>` 标签加载 `washi.min.js`。该立即调用函数表达式（`IIFE`）产物会将所有导出项挂载到全局变量 `window.Washi`：

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

    <!-- 通过 CDN 加载 WaSHI 核心 + HiGHS (MIT)（自托管时可使用 "./dist/browser/washi.min.js"） -->
    <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js"></script>
    <!-- 内置或可选插件（自动注册到 window.Washi）： -->
    <!-- <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/solvers/pumpkin.min.js"></script> -->
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

### 跨源 CDN Worker 引导

在标准的 `http://` 与 `https://` 源下，浏览器会拦截直接调用 `new Worker("https://cdn...")`。WaSHI 会通过轻量级 ES 模块 `Blob` 引导脚本自动桥接跨源 CDN Worker。

### 直接打开本地 `.html` 文件（`file://`）

| 场景 | 行为与前提条件 |
| --- | --- |
| **CDN 脚本** | 从 HTTPS CDN 加载 `washi.min.js`（及 `solvers/pumpkin.min.js`）时，双击打开 `file://` 即可直接运行，无需本地服务器。 |
| **不透明源（`window.origin === "null"`）** | 在 `file://` 页面或未设置 `allow-same-origin` 的沙箱 `<iframe>` 下，未指定 `useWorker` 时 WaSHI 会自动在主线程运行 HiGHS 与 Pumpkin。 |
| **自托管 `.wasm` 与 Z3** | 浏览器会拦截 `file://` 下本地 `.wasm` 的 `fetch()` 请求，因此需通过 `http://` 或 `https://` 托管。使用 Z3 还需安全上下文（`https://` 或 `http://localhost`）与跨源隔离。 |

---

## 🔒 离线、内网与严格 CSP 环境部署

WaSHI 绝不会主动联网或回退到公共 CDN。在物理隔离的内网或严格 `CSP` 环境下自托管时，请完成以下三项配置：

### 1. 完整部署 `dist/browser/` 目录

请将 `node_modules/@ohtaman/washi/dist/browser/` 整个目录原样复制到您的静态服务器。ESM 入口文件（`washi.js`、`highs-worker.js`、`solvers/pumpkin.js`）依赖同级的带哈希分块文件，如 `loader-*.js`、`browser-runtime-*.js` 与 `solvers/pumpkin-*.js`。

| 产物 | `dist/browser/` 下的必需文件 |
| --- | --- |
| **核心（HiGHS）** | `washi.js` / `washi.min.js`、`highs.wasm`、`highs-worker.js` 及根目录 `*.js` 分块 |
| **内置 Pumpkin** | `solvers/pumpkin.js` / `solvers/pumpkin.min.js`、`solvers/pumpkin.wasm`、`solvers/pumpkin-worker.js` 及 `solvers/pumpkin-*.js` 分块 |
| **可选 GLPK** | `solvers/glpk.js` / `solvers/glpk.min.js` |
| **可选 Z3** | `solvers/z3.js` / `solvers/z3.min.js`、`solvers/z3-built.js`、`solvers/z3-built.wasm` |

### 2. 配置 CSP 指令

| 指令 | 所需配置值 | 作用 |
| --- | --- | --- |
| `script-src` | `'wasm-unsafe-eval'` | 允许编译 WebAssembly 模块。 |
| `worker-src` | `'self' blob:` | 允许默认 Web Worker 与 CDN `Blob` Worker 引导。 |
| 禁用 `blob:` 时的替代方案 | 仅 `'self'` | 从同源托管 `highs-worker.js` / `solvers/pumpkin-worker.js`，或传入 `{ useWorker: false }`。 |

### 3. 开启跨源隔离（仅限使用 Z3 时）

HiGHS、Pumpkin 与 GLPK 在普通浏览器上下文中即可运行，无需隔离响应头。Z3 使用基于 `SharedArrayBuffer` 的多线程机制，因此浏览器要求**安全上下文**（`https://` 或 `http://localhost`）。同时还需配置 `Cross-Origin-Opener-Policy` 与 `Cross-Origin-Embedder-Policy` 响应头（`COOP`/`COEP`），详见[跨源隔离配置指南](./cross-origin.md)。
