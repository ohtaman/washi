# ランタイム環境設定

WaSHI は、C++ のネイティブビルドを一切必要とせず、あらゆる JavaScript / TypeScript ランタイムで動作するように設計されています。

---

## 🟢 Node.js

Node.js (v18+) の標準 ESM をネイティブサポートしています。

```typescript
import { Model, expr, c } from "@ohtaman/washi";

const model = new Model();
const x = model.addVar({ lb: 0, ub: 10 });
model.maximize(x);

await model.solve();
console.log("x =", x.value);
```

---

## 🌐 ブラウザ (Vite, Webpack, Next.js)

### Vite / Rollup

モダンバンドラーを利用する場合、WebAssembly アセットは自動的にバンドルされます。

```typescript
import { Model, expr, c } from "@ohtaman/washi";

export async function runOptimization() {
  const model = new Model({ solver: "highs" });
  const x = model.addVar({ lb: 0, ub: 100 });
  model.maximize(x);
  await model.solve();
  return x.value;
}
```

### Next.js & サーバーサイドレンダリング (SSR)

Next.js アプリケーションでは、サーバー側（Node.js ランタイム）またはクライアントコンポーネント（ブラウザ内実行）のどちらでも最適化を実行できます。

---

## 🟨 静的 HTML & script タグ (CDN)

ビルドツールを導入せず、CDN から直接ブラウザに読み込んで使用できます：

```html
<script src="https://cdn.jsdelivr.net/npm/@ohtaman/washi@latest/dist/browser/washi.min.js"></script>
<script>
  (async () => {
    const { Model, expr, c } = Washi;
    const model = new Model({ sense: "Maximize" });
    const x = model.addVar({ lb: 0, ub: 10 });
    model.maximize(x);
    await model.solve();
    console.log("x =", x.value);
  })();
</script>
```
