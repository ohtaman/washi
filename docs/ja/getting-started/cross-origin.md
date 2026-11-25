# Cross-Origin Isolation 設定（Z3 & ブラウザ）

ブラウザ上で Z3 ソルバーを実行するには、**セキュアコンテキスト**と **Cross-Origin Isolation** の 2 つの条件が必要です。これらを満たすことで、Z3 のマルチスレッド WebAssembly が使用する `SharedArrayBuffer` が有効になります。

> [!TIP]
> **HiGHS・Pumpkin・GLPK や Node.js 環境では不要です**: HiGHS・Pumpkin・GLPK は `SharedArrayBuffer` を使わず、通常のブラウザ環境（特別な HTTP ヘッダーなし）で動作します。Node.js 上の Z3 でも HTTP ヘッダーは不要です。ブラウザで `@ohtaman/washi/solvers/z3` を使う場合のみ本ページを参照してください。

---

## これらの前提条件が必要な理由

Z3 の WebAssembly バイナリは、`SharedArrayBuffer` と Web Worker を用いた POSIX スレッド（`pthreads`）で動作します。モダンブラウザは Spectre 型のサイドチャネル攻撃を緩和するため、`SharedArrayBuffer` をデフォルトで無効化しています。

ブラウザが `SharedArrayBuffer` を有効化するのは、トップレベルドキュメントで次の両方を満たす場合のみです：

1. **セキュアコンテキスト**: `https://` または `http://localhost`（`127.0.0.1`・`[::1]` 含む）で読み込まれ、`window.isSecureContext === true` であること（通常の `http://` LAN IP は不可）。
2. **Cross-Origin Isolation**: HTTP レスポンスヘッダーにより Cross-Origin Isolation が有効になり、`window.crossOriginIsolated === true` であること。

---

## 必要な HTTP レスポンスヘッダー

トップレベルの HTML ドキュメントに次の 2 つのヘッダーを付与します：

- **Cross-Origin-Opener-Policy（`COOP`）**: `same-origin`
- **Cross-Origin-Embedder-Policy（`COEP`）**: `require-corp`

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

別オリジンからスクリプト・画像・`.wasm` ファイルを読み込む場合は、リクエストモードに応じて `Cross-Origin-Resource-Policy: cross-origin`（`CORP`）または適切な CORS ヘッダー（`Access-Control-Allow-Origin`）が必要です。

> [!NOTE]
> Chromium 系ブラウザと Firefox では、外部サブリソースの `CORP` 要件を緩和できる `Cross-Origin-Embedder-Policy: credentialless` も利用できます。ただし **Safari（WebKit）は `credentialless` に未対応**のため、Safari や iOS をサポートする場合は `require-corp` を使用してください。

---

## 環境別の設定方法

### 1. Vite（`vite.config.ts`）

`vite` 開発サーバーと `vite preview` サーバーの両方に、これらのヘッダーを設定します：

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

ビルド出力のルートにコピーされるよう、`public/_headers` ファイルを作成します：

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

### 4. Express（Node.js カスタムサーバー）

```javascript
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
```

### 5. ヘッダー変更ができない静的ホスティング（GitHub Pages 等）

GitHub Pages などの環境では HTTP レスポンスヘッダーを独自に設定できません。代わりに **`coi-serviceworker`** を使い、Service Worker 経由でレスポンスに `COOP`・`COEP` ヘッダーを付与します。Service Worker 自体もセキュアコンテキスト（`https://` または `http://localhost`）を前提とします。

1. [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) の `coi-serviceworker.js`、または WaSHI の [`public/coi-serviceworker.js`](https://github.com/ohtaman/washi/blob/main/public/coi-serviceworker.js) をサイトルートに配置します。
2. HTML の `<head>` 内に以下を追加します：

```html
<script src="/coi-serviceworker.js"></script>
```

初回アクセス時に Service Worker が登録されてページが 1 回リロードされ、`window.crossOriginIsolated` が `true` になります。

---

## WaSHI における実行時チェック

ブラウザで Z3 を初期化する前に、WaSHI は次の 2 つの前提条件を順番に検証します：

| チェック項目 | 失敗条件 | 動作 |
| --- | --- | --- |
| **セキュアコンテキスト** | `!window.isSecureContext` かつホスト名が `localhost` / `127.0.0.1` / `[::1]` でない | `solve()`・`check()` が、HTTPS または `localhost` が必要である旨のエラーで即座に reject されます。 |
| **Cross-Origin Isolation** | `SharedArrayBuffer` 未定義または `window.crossOriginIsolated !== true` | `solve()`・`check()` がハングせず、必要な `COOP`・`COEP` ヘッダーを示すエラーで即座に reject されます。 |
