# ランタイム環境とデプロイ構成

WaSHI は C/C++ のネイティブビルドなしで、JavaScript / TypeScript の多様なランタイムで動作します。Node.js・Bun・Deno からモダンバンドラー、静的ホスティング、素の `<script>` タグ、オフライン WebView アプリまで幅広く対応します。

| 対象環境 | エントリーポイント | Worker・ヘッダーの要点 |
| --- | --- | --- |
| **Node.js (v18+), Bun, Deno** | `@ohtaman/washi`（Deno は `npm:@ohtaman/washi`） | パッケージ内の `.wasm` を直接読み込み。HTTP ヘッダー不要。 |
| **Vite, Next.js, Webpack, Rollup** | `@ohtaman/washi` | HiGHS と Pumpkin はデフォルトで Web Worker 実行。 |
| **Tauri, Capacitor, PWA** | 標準の Vite ビルド | オフライン動作。Content Security Policy（`CSP`）で `'wasm-unsafe-eval'` を許可。 |
| **ブラウザ ESM（`<script type="module">`）** | `dist/browser/washi.js` | セルフホスト時は `dist/browser/` のチャンク一式をそのまま配置。 |
| **単一 HTML / CDN（`<script>`）** | `dist/browser/washi.min.js` | `window.Washi` を公開。CDN 版は `file://` でも直接実行可能。 |

---

## 🟢 Node.js / Bun / Deno

### Node.js

WaSHI は Node.js 18+ の標準 ECMAScript Modules（`ESM`）に対応しています。同梱の HiGHS と Pumpkin（`@ohtaman/washi/solvers/pumpkin`）の WebAssembly バイナリは、パッケージ内から直接読み込まれます：

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

パッケージのルートエクスポート（`@ohtaman/washi`）は、`types`・`import`・`default` 条件を通じて `./dist/lib/washi.js` に解決されます。この統一 ESM バンドルが、実行時に Node.js とブラウザ環境を自動判別します：

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

モデラーとソルバーの両方が WebAssembly で動作します。そのため、`vite build` の静的成果物を GitHub Pages・Cloudflare Pages・Vercel・Netlify へそのまま配信できます。同梱の HiGHS・Pumpkin とオプションの GLPK は、特別な HTTP ヘッダーを必要としません。

#### Web Worker によるバックグラウンド実行（デフォルト）

ブラウザ環境では、**HiGHS** と **Pumpkin** はデフォルトで専用の Web Worker 内で実行されます。`LP`・`MIP`・`QP`・`CP` の求解中も UI スレッドが固まらず、`onProgress` 通知と `AbortSignal` 中断が機能します。

Web Worker が使えない環境やメインスレッド実行を選びたい場合は、`useWorker: false` を指定します：

```typescript
await m.solve({ useWorker: false });
```

#### WASM アセット URL のカスタマイズ

デフォルトでは、`import.meta.url` を使ってバンドルからの相対パスで `highs.wasm` と `pumpkin.wasm` を解決します。外部 CDN（`jsdelivr` や `unpkg` など）へ暗黙的にフォールバック通信することは一切ありません。

カスタムパスで `.wasm` を配信する場合は、グローバルまたは呼び出しごとに URL を上書きできます：

```typescript
import { setHighsWasmUrl } from "@ohtaman/washi";
import { setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

// 方法 A: 求解前にグローバル設定
setHighsWasmUrl("/assets/wasm/highs.wasm");
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");

// 方法 B: solve / check 呼び出しごとに指定
await m.solve({ wasmUrl: "/assets/wasm/highs.wasm" });
```

### Next.js & サーバーサイドレンダリング (SSR)

Next.js の App / Pages Router では、Server Actions・API Routes と `"use client"` コンポーネントの両方で実行できます：

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

### デスクトップ・モバイル WebView アプリ (Tauri / Capacitor / PWA)

標準の Vite フロントエンド構成のまま、**HiGHS** と **Pumpkin**（`@ohtaman/washi/solvers/pumpkin`）を静的アセットとしてオフライン実行できます。Tauri（`tauri://localhost` / `http://tauri.localhost`）、Capacitor モバイル WebView、オフライン PWA でネイティブビルドなしに動作します。

`tauri.conf.json` では、`CSP` で WebAssembly コンパイルと Web Worker を許可するか、`{ useWorker: false }` を指定します：

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:"
    }
  }
}
```

WebView 環境では、Z3 のブラウザ分離要件を避けられる同梱の HiGHS・Pumpkin の利用を推奨します。

---

## 📦 ブラウザ ESM (`<script type="module">`)

ビルドツールを使わずに、セルフホストの静的サーバーや npm CDN からブラウザ向け ESM バンドルを直接インポートできます：

```html
<script type="module">
  // npm CDN からの読み込み（セルフホスト時は "./dist/browser/washi.js" 等）:
  import { Model, expr, maximize } from "https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.js";
  // 同梱・オプションのソルバープラグイン:
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

## 🟨 クラシック `<script>` タグ (IIFE / 単一 HTML / CDN)

単一 HTML ファイルや CodePen・JSFiddle では、クラシック `<script>` タグで `washi.min.js` を読み込みます。この即時実行関数式（`IIFE`）バンドルは、すべての API をグローバル変数 `window.Washi` に公開します：

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
    <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js"></script>
    <!-- 同梱・オプションプラグイン (window.Washi に自動登録): -->
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

### クロスオリジン CDN での Worker 起動

通常の `http://`・`https://` オリジンでは直接の `new Worker("https://cdn...")` がブロックされます。WaSHI は軽量な ES モジュール `Blob` ブートストラップで、クロスオリジン CDN の Worker を自動起動します。

### ローカル `.html` ファイルの直接起動（`file://`）

| シナリオ | 動作と前提条件 |
| --- | --- |
| **CDN スクリプト** | HTTPS CDN から読み込む `washi.min.js`（および `solvers/pumpkin.min.js`）は、`file://` のダブルクリックでサーバーなしに動作します。 |
| **不透明オリジン（`window.origin === "null"`）** | `file://` ページや `allow-same-origin` なしのサンドボックス `<iframe>` では、`useWorker` 未指定時に HiGHS と Pumpkin が自動的にメインスレッドで実行されます。 |
| **セルフホスト `.wasm` と Z3** | ローカル `.wasm` は `file://` 上の `fetch()` がブロックされるため `http://` または `https://` が必要です。Z3 にはさらにセキュアコンテキスト（`https://` または `http://localhost`）と Cross-Origin Isolation が必要です。 |

---

## 🔒 オフライン・イントラネット・厳格な CSP 環境での運用

WaSHI は外部 CDN への暗黙的な通信を行いません。閉域網や厳格な `CSP` 環境でセルフホストする場合は、次の 3 点を設定します：

### 1. `dist/browser/` ディレクトリをそのまま配置する

`node_modules/@ohtaman/washi/dist/browser/` を、ディレクトリ構造ごと同一オリジンへ配置してください。`washi.js`・`highs-worker.js`・`solvers/pumpkin.js` などの ESM エントリーは、`loader-*.js`・`browser-runtime-*.js`・`solvers/pumpkin-*.js` のような同一ディレクトリ内のハッシュ付きチャンクを参照します。

| バンドル | `dist/browser/` 配下の必要ファイル |
| --- | --- |
| **コア（HiGHS）** | `washi.js` / `washi.min.js`、`highs.wasm`、`highs-worker.js`、直下の `*.js` チャンク |
| **同梱 Pumpkin** | `solvers/pumpkin.js` / `solvers/pumpkin.min.js`、`solvers/pumpkin.wasm`、`solvers/pumpkin-worker.js`、`solvers/pumpkin-*.js` チャンク |
| **オプション GLPK** | `solvers/glpk.js` / `solvers/glpk.min.js` |
| **オプション Z3** | `solvers/z3.js` / `solvers/z3.min.js`、`solvers/z3-built.js`、`solvers/z3-built.wasm` |

### 2. CSP ディレクティブを設定する

| ディレクティブ | 必要な設定値 | 用途 |
| --- | --- | --- |
| `script-src` | `'wasm-unsafe-eval'` | WebAssembly モジュールのコンパイルを許可する。 |
| `worker-src` | `'self' blob:` | 標準の Web Worker と CDN `Blob` ブートストラップを許可する。 |
| `blob:` 禁止時の代替 | `'self'` のみ | `highs-worker.js`・`solvers/pumpkin-worker.js` を同一オリジンから配信するか、`{ useWorker: false }` を指定する。 |

### 3. Cross-Origin Isolation を有効化する（Z3 利用時のみ）

HiGHS・Pumpkin・GLPK は通常のブラウザ環境で分離ヘッダーなしに動作します。Z3 は `SharedArrayBuffer` マルチスレッドを使うため、**セキュアコンテキスト**（`https://` または `http://localhost`）が必要です。あわせて `Cross-Origin-Opener-Policy` と `Cross-Origin-Embedder-Policy` ヘッダー（`COOP`/`COEP`）も設定してください。詳細は [Cross-Origin Isolation 設定](./cross-origin.md) を参照してください。
