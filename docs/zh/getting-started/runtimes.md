# 运行时环境与部署配置

WaSHI 无需本地 C/C++ 编译，即可跨 JavaScript 与 TypeScript 运行时环境一致运行——从 Node.js、Bun、Deno 到现代前端打包工具、原生浏览器 `<script>` 标签以及物理隔离的企业内网环境。

---

## 🟢 Node.js

WaSHI 原生支持 Node.js (v18+) 的标准 ECMAScript Modules (ESM)。内置的 HiGHS WebAssembly 二进制文件会直接从已安装的包中加载。

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("NodeExample");
const x = m.continuous("x", { lb: 0, ub: 10 });
const y = m.continuous("y", { lb: 0, ub: 20 });

m.objective(maximize(expr`2 * ${x} + 3 * ${y}`));
m.constraint(expr`${x} + ${y} <= 15`, "capacity");

await m.solve();
console.log(`Status: ${m.status}, Objective: ${m.objectiveValue}`);
console.log(`x = ${x.value}, y = ${y.value}`);
```

使用 `tsx` 或 `node` 直接运行：

```bash
npx tsx app.ts
```

---

## 🌐 打包工具环境 (Vite, Webpack, Rollup, Next.js)

### 现代打包工具 (Vite / Rollup / Webpack)

在面向浏览器的打包工具中导入 `@ohtaman/washi` 时，`browser` 导出条件会自动解析：

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

export async function runOptimization() {
  const m = new Model({ solver: "highs" });
  const x = m.continuous("x", { lb: 0, ub: 100 });
  m.objective(maximize(x));
  await m.solve();
  return x.value;
}
```

#### 后台 Web Worker 执行（默认）
在浏览器环境中，HiGHS 默认在专用的 **Web Worker** 中运行。这样即使在求解大规模 LP / MIP / QP 模型时，也不会阻塞主 UI 线程、动画或用户输入，同时支持实时进度回调（`onProgress`）与取消操作（`AbortSignal`）。

如果您的运行环境限制使用 Web Worker，或者希望在主线程中同步执行，可以传入 `useWorker: false`：

```typescript
await m.solve({ useWorker: false });
```

#### 自定义 HiGHS WASM 资源 URL
默认情况下，WaSHI 会相对于打包产物解析 `highs.wasm`（`new URL("./highs.wasm", import.meta.url)`），**绝不会**向外部公共 CDN（如 `jsdelivr`、`unpkg` 等）发起隐式网络请求。

如果您的打包工具或静态资源服务器将 `.wasm` 文件托管在自定义路径下，可以在全局或每次求解时指定 URL：

```typescript
import { setHighsWasmUrl } from "@ohtaman/washi";

// 方式 A：在求解前全局配置
setHighsWasmUrl("/assets/wasm/highs.wasm");

// 方式 B：在每次调用 solve 时单独配置
await m.solve({ wasmUrl: "/assets/wasm/highs.wasm" });
```

### Next.js 与服务端渲染 (SSR)

在 Next.js 的 App Router 或 Pages Router 中，优化模型既可以在 Server Actions / API Routes（Node.js 运行时）中运行，也可以在客户端 `"use client"` 组件内直接运行：

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
    setVal(x.value);
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

## 📦 浏览器 ESM (`<script type="module">`)

无需构建步骤，您可以直接从本地静态服务器（或待包含相应 API 的版本发布后的 npm CDN）导入预打包的浏览器 ESM 模块：

```html
<script type="module">
  // 从本地静态服务器 / dist 加载：
  import { Model, expr, maximize } from "./dist/browser/washi.js";
  // 或待相应版本发布后通过 npm CDN 加载：
  // import { Model, expr, maximize } from "https://cdn.jsdelivr.net/npm/@ohtaman/washi@<version>/dist/browser/washi.js";
  // 可选的求解器插件：
  // import "./dist/browser/solvers/glpk.js";
  // import "./dist/browser/solvers/z3.js";

  const m = new Model("BrowserESM");
  const x = m.integer("x", { lb: 0 });
  const y = m.integer("y", { lb: 0 });

  m.objective(maximize(expr`30 * ${x} + 50 * ${y}`));
  m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");
  m.constraint(expr`2 * ${x} + ${y} <= 50`, "labor");

  await m.solve();
  console.log("Optimal Objective:", m.objectiveValue);
</script>
```

---

## 🟨 传统 `<script>` 标签 (IIFE / 独立构建发布 / CDN)

对于静态 HTML 页面、CodePen 或 JSFiddle，可通过标准 `<script>` 标签加载 `washi.min.js`。所有导出项均挂载在全局变量 `window.Washi` 上：

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

    <!-- 从本地静态构建 / 资源加载 WaSHI 核心 + HiGHS (MIT) -->
    <script src="./dist/browser/washi.min.js"></script>
    <!-- 或待相应版本发布后通过 CDN 加载： -->
    <!-- <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi@<version>/dist/browser/washi.min.js"></script> -->
    <!-- 可选插件（自动注册到 window.Washi）： -->
    <!-- <script src="./dist/browser/solvers/glpk.min.js"></script> -->
    <!-- <script src="./dist/browser/solvers/z3.min.js"></script> -->

    <script>
      (async () => {
        const { Model, expr, maximize } = Washi;

        const m = new Model("BrowserDemo");
        const x = m.continuous("x", { lb: 0, ub: 10 });
        const y = m.continuous("y", { lb: 0, ub: 20 });

        m.objective(maximize(expr`2 * ${x} + 3 * ${y}`));
        m.constraint(expr`${x} + ${y} <= 15`);

        await m.solve();

        document.getElementById("output").textContent =
          `Status: ${m.status}\n` +
          `Objective: ${m.objectiveValue}\n` +
          `x = ${x.value}, y = ${y.value}`;
      })();
    </script>
  </body>
</html>
```

> [!NOTE]
> 当从跨源 CDN（如 jsDelivr 或 unpkg）加载 `washi.min.js` 时，浏览器的同源策略会拦截直接调用 `new Worker("https://cdn...")`。WaSHI 会自动通过调用 `importScripts()` 的轻量级 `Blob` 包装器桥接跨源 Worker，因此从 CDN 加载时同样可以开箱即用地使用 Web Worker。

---

## 🔒 离线、内网与严格 CSP 环境部署

WaSHI 绝不会向外部发送遥测数据或隐式回退到公共 CDN。若需在物理隔离的内网或严格的内容安全策略 (CSP) 环境下自托管部署，请按以下步骤配置：

1. **复制静态资源**：将 `node_modules/@ohtaman/washi/dist/browser/` 下的文件托管到您自己的同源服务器上：
   - `washi.js` / `washi.min.js`、`highs.wasm` 以及 `highs-worker.js`
   - 可选 GLPK：`solvers/glpk.js` / `solvers/glpk.min.js`
   - 可选 Z3：`solvers/z3.js` / `solvers/z3.min.js`、`solvers/z3-built.js`、`solvers/z3-built.wasm`
2. **内容安全策略 (CSP) 响应头**：
   - 允许 WebAssembly 编译（在 `script-src` 中包含 `'wasm-unsafe-eval'`）。
   - 若使用默认的 Web Worker 或跨源 Blob Worker 回退方案，请允许 `worker-src 'self' blob:;`。
   - 如果安全策略禁止 `blob:` Worker，请从同源（`'self'`）托管 `highs-worker.js`，或使用 `await m.solve({ useWorker: false })` 在主线程中运行。
3. **跨源隔离（仅限使用 Z3 时）**：
   - HiGHS 与 GLPK 在标准浏览器上下文中即可直接运行，无需特殊响应头。
   - Z3 WASM 使用了 pthreads 与 `SharedArrayBuffer`，需要配置 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`（或 `credentialless`）。详细配置请参阅[跨源隔离配置指南](./cross-origin.md)。

---

## ⚡ Bun & Deno

### Bun

```bash
bun add @ohtaman/washi
bun run app.ts
```

### Deno

在 Deno（v1.30+，支持 `npm:` 标识符）中：

```typescript
import { Model, maximize } from "npm:@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0, ub: 10 });
m.objective(maximize(x));
await m.solve();
console.log("x =", x.value);
```
