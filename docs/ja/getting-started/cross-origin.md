# Cross-Origin Isolation 設定 (Z3 & ブラウザ)

ブラウザ内で **Z3** ソルバーを実行する場合、`SharedArrayBuffer` を有効化するために Cross-Origin Isolation 用の HTTP レスポンスヘッダーが必要になります。

> [!TIP]
> **HiGHS・GLPK・Node.js では設定不要です**: 標準搭載の **HiGHS** および **GLPK** プラグインは `SharedArrayBuffer` を使わないため、通常のブラウザ環境でそのまま動作します。また **Node.js** で Z3 を動かす場合も不要です。ブラウザ上で `@ohtaman/washi/solvers/z3` を使う場合のみ本ページを参照してください。

---

## なぜ Cross-Origin Isolation が必要なのか？

Z3 の WebAssembly ビルドは、`SharedArrayBuffer` と Web Worker を用いたマルチスレッド（pthreads）で動作します。モダンブラウザ（Chrome, Firefox, Safari, Edge）では Spectre 型のサイドチャネル攻撃を緩和するため、トップレベルページが **Cross-Origin Isolated**（`window.crossOriginIsolated === true`）でない限り `SharedArrayBuffer` が無効化されています。

---

## 必要な HTTP レスポンスヘッダー

トップレベルの HTML ドキュメントに以下の HTTP ヘッダーを付与して配信します：

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

外部ドメインからサブリソース（画像・スクリプト・WASM ファイル等）を読み込む場合は、それらのレスポンスにも `Cross-Origin-Resource-Policy: cross-origin`（または CORS ヘッダー）が必要です。

> [!NOTE]
> Chromium 系ブラウザと Firefox では、外部サブリソースの CORP 要件を緩和できる `Cross-Origin-Embedder-Policy: credentialless` も動作しますが、**Safari（macOS / iOS WebKit）は `credentialless` に未対応**です。Safari を含む主要ブラウザ全体で動かす場合は `require-corp` を使用してください。

---

## 環境別の設定方法

### 1. Vite (`vite.config.ts`)

開発サーバー（`vite`）と本番プレビュー（`vite preview`）の両方に設定します：

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

ビルド出力のルートに配置されるよう、`public/_headers` ファイルを作成します：

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

### 4. Node.js / Express サーバー

```javascript
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
```

### 5. ヘッダー変更ができない静的ホスティング（GitHub Pages 等）

GitHub Pages のようにカスタム HTTP レスポンスヘッダーを設定できない環境では、Service Worker でクライアント側から分離ヘッダーを付与する **`coi-serviceworker`** を利用できます：

1. `coi-serviceworker.js` をサイトのルートディレクトリに配置します。
2. HTML の `<head>` 内に以下を追加します：

```html
<script src="/coi-serviceworker.js"></script>
```

初回アクセス時に Service Worker が登録されてページが1回リロードされ、`window.crossOriginIsolated === true` が有効になります。

---

## WaSHI における実行時チェック

WaSHI の Z3 アダプターは、ブラウザでの初期化前に `crossOriginIsolated` を自動検査します。Cross-Origin Isolation が無効な場合は無応答でハングするのではなく、COOP/COEP ヘッダーまたは Service Worker が必要である旨を示す明確なエラーで即座に reject します。
