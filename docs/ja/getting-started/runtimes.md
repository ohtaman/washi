# ランタイム環境とデプロイ構成

WaSHI はネイティブビルドなしで、JavaScript / TypeScript の多様なランタイムや配信形態で動作します。Node.js・Bun・Deno からモダンバンドラー、静的ホスティング、クラシック `<script>` タグ、オフライン WebView アプリまで幅広く対応します。

| 対象環境 | エントリーポイント | Worker・ヘッダーの要点 |
| --- | --- | --- |
| **Node.js（v18+）・Bun・Deno** | `@ohtaman/washi`（Deno は `npm:@ohtaman/washi`） | パッケージ内の `.wasm` を直接読み込みます。HTTP ヘッダー不要。 |
| **Vite・Next.js・Webpack・Rollup** | `@ohtaman/washi` | HiGHS と Pumpkin はデフォルトで Web Worker 内で実行されます。 |
| **Tauri・Capacitor・PWA** | `@ohtaman/washi`（標準の Vite ビルド） | オフライン動作。Content Security Policy（`CSP`）で `script-src` に `'wasm-unsafe-eval'`、`worker-src 'self' blob:`（または `{ useWorker: false }`）を指定します。 |
| **ブラウザ ESM（`<script type="module">`）** | `dist/browser/washi.js` | セルフホスト時は `dist/browser/` 配下のファイル一式をそのまま配置します。 |
| **単一 HTML / CDN（`<script>`）** | `dist/browser/washi.min.js` | `window.Washi` を公開します。CDN 版は `file://` でも直接実行できます。 |

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

TypeScript ファイルは `tsx`（ビルド後の `.js` は `node`）で実行できます：

```bash
npx tsx app.ts
```

### Bun & Deno

```bash
# Bun
bun add @ohtaman/washi
bun run app.ts
```

Deno（v1.30+）では `npm:` 指定子を使って読み込めます：

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

## 🌐 バンドラーと静的ホスティング（Vite・Next.js・Webpack・Rollup）

### モダンバンドラーと静的サイト配信

パッケージのルートエクスポート（`@ohtaman/washi`）は、`import`・`default` 条件で `./dist/lib/washi.js` に、`types` 条件で `./dist/types/index.d.ts` に解決されます。この統一 ESM バンドルが、実行時に Node.js とブラウザ環境を自動判別します：

```typescript
import { Model, maximize } from "@ohtaman/washi";

export async function runOptimization() {
  const m = new Model({ solver: "highs" });
  const x = m.continuous("x", { lb: 0, ub: 100 });
  m.objective(maximize(x));
  await m.solve();
  return m.hasPrimalSolution ? x.value : null;
}
```

モデラー（JS/TS）と同梱ソルバー（WebAssembly）がすべてクライアント内で完結するため、`vite build` の静的成果物をバックエンド不要で GitHub Pages・Cloudflare Pages・Vercel・Netlify へそのまま配信できます。HiGHS・Pumpkin・GLPK は特別な HTTP ヘッダー不要です（Z3 の要件は後述の「オフライン・イントラネット・厳格な CSP 環境での運用」を参照）。

#### Web Worker によるバックグラウンド実行（デフォルト）

ブラウザ環境では、**HiGHS** と **Pumpkin** はデフォルトで専用の Web Worker 内で実行されます。`LP`・`MIP`・`QP`・`CP` の求解中も UI スレッドをブロックせず、`onProgress` による進捗通知や `AbortSignal` による中断が利用できます。

Web Worker が使えない環境やメインスレッド実行を選びたい場合は、`useWorker: false` を指定します：

```typescript
await m.solve({ useWorker: false });
```

#### WASM アセット URL のカスタマイズ

デフォルトでは、`import.meta.url` を使ってバンドルからの相対パスで `highs.wasm` と `pumpkin.wasm` を解決します。外部 CDN（`jsDelivr` や `unpkg` など）へ暗黙的にフォールバックすることは一切ありません。

ブラウザ配信でカスタムパスから `.wasm` を読み込む場合は、グローバルまたは呼び出しごとに URL を上書きできます。HiGHS の `setHighsWasmUrl()`・`{ wasmUrl }` はブラウザ専用で Node.js では無視されます。Pumpkin は Node.js で `file://` URL にも対応し、Z3 では `setZ3Assets()` または `{ z3JsUrl, z3WasmUrl }` を使います：

```typescript
import { setHighsWasmUrl } from "@ohtaman/washi";
import { setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";
import { setZ3Assets } from "@ohtaman/washi/solvers/z3"; // オプションの Z3 プラグイン

// 方法 A: 求解前にグローバル設定
setHighsWasmUrl("/assets/wasm/highs.wasm");
setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
setZ3Assets({ jsUrl: "/assets/z3/z3-built.js", wasmUrl: "/assets/z3/z3-built.wasm" });

// 方法 B: solve / check 呼び出しごとに指定
await m.solve({ wasmUrl: "/assets/wasm/highs.wasm" });
// Z3 の場合: await m.check({ solver: "z3", z3JsUrl: "...", z3WasmUrl: "..." });
```

### Next.js & サーバーサイドレンダリング（SSR）

Next.js の App Router / Pages Router では、サーバー側（Server Actions・API Routes）とクライアント側（`"use client"` コンポーネント）の両方で WaSHI を実行できます。以下はクライアントコンポーネントの例です：

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

### デスクトップ・モバイル WebView アプリ（Tauri / Capacitor / PWA）

標準の Vite フロントエンド構成のまま、**HiGHS** と **Pumpkin**（`@ohtaman/washi/solvers/pumpkin`）を静的アセットとして同梱し、オフラインで実行できます。Tauri（`tauri://localhost` / `http://tauri.localhost`）、Capacitor のモバイル WebView、オフライン PWA でネイティブビルドなしに動作します。

`tauri.conf.json` の `CSP` 文字列には `'wasm-unsafe-eval'` と `worker-src 'self' blob:` を含めます。`{ useWorker: false }` でメインスレッド実行する場合は `worker-src` を省けます（各ディレクティブの詳細は後述の CSP 表を参照）：

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:"
    }
  }
}
```

WebView 環境では、Z3 の [Cross-Origin Isolation](./cross-origin.md) 要件を避けられる同梱の HiGHS・Pumpkin の利用を推奨します。

---

## 📦 ブラウザ ESM（`<script type="module">`）

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

## 🟨 クラシック `<script>` タグ（IIFE / 単一 HTML / CDN）

単一 HTML ファイルや CodePen・JSFiddle では、クラシック `<script>` タグで `washi.min.js` を読み込みます。この即時実行関数式（`IIFE`）バンドルは、コア API をグローバルオブジェクト `window.Washi` として公開します：

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

    <!-- CDN からの WaSHI コア + HiGHS（MIT）読み込み（セルフホスト時は "./dist/browser/washi.min.js" 等） -->
    <script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi/dist/browser/washi.min.js"></script>
    <!-- 同梱・オプションプラグイン（window.Washi が読み込み済みならソルバーを自動登録）: -->
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

通常の `http://`・`https://` オリジンでは、クロスオリジン URL を直接指定した `new Worker("https://cdn...")` はブロックされます。WaSHI は ES モジュールを読み込む軽量な `Blob` URL を仲介して、クロスオリジン CDN の Worker を自動起動します。

### ローカル `.html` ファイルの直接起動（`file://`）

| シナリオ | 動作と前提条件 |
| --- | --- |
| **CDN スクリプト** | HTTPS CDN から読み込む `washi.min.js`（および `solvers/pumpkin.min.js`）は、ローカル `.html` ファイルをダブルクリックして `file://` で開くだけで、サーバーなしに動作します。 |
| **不透明オリジン（`window.origin === "null"`）** | `file://` ページや `allow-same-origin` なしのサンドボックス `<iframe>` では、`useWorker` 未指定時に HiGHS と Pumpkin が自動的にメインスレッドで実行されます。 |
| **セルフホスト `.wasm` と Z3** | ローカル `.wasm` をセルフホストする場合、`file://` では `fetch()` がブロックされるため `http://` または `https://` で配信する必要があります。Z3 には後述の Cross-Origin Isolation 要件も必要です。 |

---

## 🔒 オフライン・イントラネット・厳格な CSP 環境での運用

WaSHI は外部 CDN への暗黙的な通信を行いません。閉域網や厳格な `CSP` 環境でセルフホストする場合は、次の 3 点を設定します：

### 1. `dist/browser/` ディレクトリをそのまま配置する

`node_modules/@ohtaman/washi/dist/browser/` をディレクトリ構造ごと同一オリジンへ配置してください。クラシック `<script>` 向けの `washi.min.js` や `solvers/pumpkin.min.js` も、`{ useWorker: false }` を指定しない限りデフォルトで隣接する `highs-worker.js`・`solvers/pumpkin-worker.js` を Web Worker として起動します。ESM エントリーポイントとこれらの Worker スクリプトは、`dist/browser/` 配下のハッシュ付き `*.js` チャンクを相対パスで参照します。

| バンドル | `dist/browser/` 配下の必要ファイル |
| --- | --- |
| **コア（HiGHS）** | `washi.js` / `washi.min.js`、`highs.wasm`、`highs-worker.js`、`dist/browser/` 直下の `*.js` チャンク |
| **同梱 Pumpkin** | `solvers/pumpkin.js` / `solvers/pumpkin.min.js`、`solvers/pumpkin.wasm`、`solvers/pumpkin-worker.js`、`solvers/pumpkin-*.js` チャンク |
| **オプション GLPK** | `solvers/glpk.js` / `solvers/glpk.min.js` |
| **オプション Z3** | `solvers/z3.js` / `solvers/z3.min.js`、`solvers/z3-built.js`、`solvers/z3-built.wasm` |

### 2. CSP ディレクティブを設定する

| ディレクティブ | 必要な設定値 | 用途 |
| --- | --- | --- |
| `script-src` | `'wasm-unsafe-eval'` | WebAssembly モジュールのコンパイルを許可する。 |
| `worker-src` | `'self' blob:` | 標準の Web Worker と CDN `Blob` ブートストラップを許可する。 |
| `worker-src`（`blob:` 禁止時） | `'self'` のみ | `highs-worker.js`・`solvers/pumpkin-worker.js` を同一オリジンから配信するか、`{ useWorker: false }` を指定する。 |

### 3. Cross-Origin Isolation を有効化する（Z3 利用時のみ）

HiGHS・Pumpkin・GLPK は通常のブラウザ環境で Cross-Origin Isolation ヘッダーなしに動作します。Z3 は `SharedArrayBuffer` を用いたマルチスレッド実行を行うため、**セキュアコンテキスト**（`https://` または `http://localhost`）が必要です。あわせて `Cross-Origin-Opener-Policy` と `Cross-Origin-Embedder-Policy` ヘッダー（`COOP`/`COEP`）も設定してください。詳細は [Cross-Origin Isolation 設定](./cross-origin.md) を参照してください。
