# Cross-Origin Isolation 設定 (Z3 & ブラウザ)

ブラウザ内で **Z3** ソルバーエンジンを実行する場合、ブラウザのセキュリティモデルに基づき特別な HTTP レスポンスヘッダーが必要になります。

---

## なぜ Cross-Origin Isolation が必要なのか？

Z3 の WebAssembly エンジンは、`SharedArrayBuffer` と Web Worker を用いたマルチスレッド（pthreads）で動作します。

モダンブラウザ（Chrome, Firefox, Safari, Edge）では、Spectre 型のサイドチャネル攻撃を緩和するため、デフォルトで `SharedArrayBuffer` が無効化されています。これを有効化するには、ホストする Web ページが **Cross-Origin Isolated（クロスオリジン分離）** 状態である必要があります。

---

## 必要な HTTP レスポンスヘッダー

クロスオリジン分離を確立するには、Web サーバーがトップレベルの HTML ドキュメントに以下の HTTP ヘッダーを付与して配信する必要があります：

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

また、外部ドメインから読み込むクロスオリジンアセット（スクリプトや WASM ファイルなど）には以下のヘッダーが必要です：

```http
Cross-Origin-Resource-Policy: cross-origin
```

---

## ホスティング環境別の設定方法

### 1. Node.js / Express サーバー

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

### 3. ヘッダー変更ができない静的ホスティング（GitHub Pages 等）

GitHub Pages などの静的ホスティングサービスでは、カスタム HTTP レスポンスヘッダーを直接設定できません。

このような環境では、クライアント側で Service Worker を介して分離ヘッダーを注入する **`coi-serviceworker`** を利用できます：

1. `coi-serviceworker.js` をサイトのルートディレクトリに配置します。
2. HTML の `<head>` 内に以下を追加します：

```html
<script src="/coi-serviceworker.js"></script>
```

初回アクセス時に Service Worker が登録されてページが1回リロードされ、`window.crossOriginIsolated === true` が有効になります。

---

## WaSHI における実行時チェック

WaSHI の Z3 ソルバーアダプターは、実行時にブラウザ環境を自動検査します。Cross-Origin Isolation が無効なブラウザ環境で Z3 が呼び出された場合、無応答でハングするのではなく、COOP/COEP ヘッダーまたは Service Worker が必要である旨を説明する明確なエラーメッセージとともに Promise を reject します。

> [!TIP]
> デフォルトの **HiGHS** ソルバーおよび **GLPK** ソルバーは `SharedArrayBuffer` や Cross-Origin Isolation を必要としません。標準的なブラウザ環境でそのまま動作します。
