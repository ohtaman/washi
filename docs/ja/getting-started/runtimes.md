# ランタイム環境とデプロイ構成

WaSHI は C/C++ のネイティブビルドを必要とせず、Node.js・Bun・Deno からモダンバンドラー、静的ホスティング、ブラウザの `<script>` タグ、閉域網のイントラネット環境まで一貫して動作します。

---

## 🟢 Node.js / Bun / Deno

### Node.js

Node.js (v18+) の標準 ECMAScript Modules (ESM) をそのままサポートしています。同梱の HiGHS WebAssembly バイナリはパッケージ内から直接読み込まれます：

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

`tsx` または `node` で実行できます：

```bash
npx tsx app.ts
```

### Bun & Deno

```bash
# Bun
bun add @ohtaman/washi
bun run app.ts
```

Deno（v1.30+ の `npm:` 指定子）：

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

## 🌐 バンドラーと静的ホスティング (Vite, Next.js, Webpack, Rollup)

### モダンバンドラーと静的サイト配信

ブラウザ向けバンドラーで `@ohtaman/washi` をインポートすると、`browser` エクスポート条件が自動的に解決されます：

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

モデラーとソルバーの両方が WebAssembly で動作するため、`vite build` 等のビルド成果物（JS・Worker・WASM）をそのまま **GitHub Pages・Cloudflare Pages・Vercel・Netlify** などの静的ホスティングに配置するだけで公開できます（標準の HiGHS と GLPK は特別な HTTP ヘッダー不要。ブラウザで Z3 を使う場合のみ [Cross-Origin Isolation 設定](./cross-origin.md) を参照してください）。

#### Web Worker によるバックグラウンド実行（デフォルト）
ブラウザ環境では、HiGHS はデフォルトで専用の **Web Worker** 内で実行されます。これにより、LP / MIP / QP の求解中でも UI スレッドやアニメーションがフリーズせず、リアルタイムの進捗通知（`onProgress`）や中断（`AbortSignal`）が機能します。

Web Worker が制限されている環境やメインスレッドで実行したい場合は、`useWorker: false` を指定します：

```typescript
await m.solve({ useWorker: false });
```

#### HiGHS WASM アセット URL のカスタマイズ
デフォルトでは、WaSHI はバンドルからの相対パス（`new URL("./highs.wasm", import.meta.url)`）で `highs.wasm` を解決します。外部 CDN（`jsdelivr` や `unpkg` など）へ暗黙的にフォールバック通信することは一切ありません。

カスタムパスで `.wasm` を配信する場合は、グローバルまたは求解ごとに URL を指定できます：

```typescript
import { setHighsWasmUrl } from "@ohtaman/washi";

// 方法 A: 求解前にグローバル設定
setHighsWasmUrl("/assets/wasm/highs.wasm");

// 方法 B: solve 呼び出しごとに指定
await m.solve({ wasmUrl: "/assets/wasm/highs.wasm" });
```

### Next.js & サーバーサイドレンダリング (SSR)

Next.js では、Server Actions / API Routes（Node.js ランタイム）と `"use client"` コンポーネント（ブラウザ内実行）のどちらでもモデルを求解できます：

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

## 📦 ブラウザ ESM (`<script type="module">`)

ビルドツールを使わずに、セルフホストの静的サーバーや npm CDN からブラウザ向け ESM バンドルを直接インポートできます：

```html
<script type="module">
  // npm CDN からの読み込み（セルフホスト時は "./dist/browser/washi.js" 等）:
  import { Model, expr, maximize } from "https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.6/dist/browser/washi.js";
  // オプションのソルバープラグイン:
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

## 🟨 クラシック `<script>` タグ (IIFE / 単一 HTML / CDN)

単一の HTML ファイルや CodePen 等では、`washi.min.js` を `<script>` タグで読み込むことでグローバル変数 `window.Washi` から全 API を利用できます：

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

    <!-- CDN からの WaSHI コア + HiGHS (MIT) 読み込み（セルフホスト時は "./dist/browser/washi.min.js" 等） -->
    <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi@0.6/dist/browser/washi.min.js"></script>
    <!-- オプションプラグイン (window.Washi に自動登録): -->
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
> jsDelivr 等のクロスオリジン CDN から読み込んだ場合、ブラウザの同一オリジンポリシーにより直接の `new Worker("https://cdn...")` はブロックされますが、WaSHI は自動的に軽量の ES モジュール `Blob` ブートストラップ（`import "https://..."`）を介して Web Worker を起動します。

---

## 🔒 オフライン・イントラネット・厳格な CSP 環境での運用

WaSHI は外部 CDN への暗黙的な通信を一切行いません。インターネット接続のない閉域網や厳格な Content Security Policy (CSP) 環境でセルフホストする場合は、以下の手順で配置できます：

1. **静的アセットの配置**: `node_modules/@ohtaman/washi/dist/browser/` 内のファイルを同一オリジンに配置します：
   - `washi.js` / `washi.min.js`, `highs.wasm`, `highs-worker.js`
   - GLPK 利用時: `solvers/glpk.js` / `solvers/glpk.min.js`
   - Z3 利用時: `solvers/z3.js` / `solvers/z3.min.js`, `solvers/z3-built.js`, `solvers/z3-built.wasm`
2. **Content Security Policy (CSP) ヘッダー**:
   - WebAssembly の実行許可（`script-src` に `'wasm-unsafe-eval'`）。
   - Web Worker またはクロスオリジン `Blob` ブートストラップを利用する場合は `worker-src 'self' blob:;` を許可します。
   - `blob:` Worker が禁止されている環境では、同一オリジン（`'self'`）から `highs-worker.js` を配信するか、`await m.solve({ useWorker: false })` でメインスレッド実行を選択してください。
3. **Cross-Origin Isolation（Z3 利用時のみ）**:
   - HiGHS と GLPK は通常のブラウザ環境でそのまま動作します。
   - Z3 WASM は pthreads と `SharedArrayBuffer` を使用するため、`Cross-Origin-Opener-Policy: same-origin` および `Cross-Origin-Embedder-Policy: require-corp` が必要です（Chromium / Firefox では `credentialless` も利用できますが、Safari 対応には `require-corp` が必要です）。詳細は [Cross-Origin Isolation 設定](./cross-origin.md) を参照してください。
