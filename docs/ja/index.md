---
layout: home

hero:
  name: 'WaS<span class="brand-hi">HI</span>'
  text: "TypeScript / JavaScript 向け代数モデラー"
  tagline: WebAssembly ベースの数理最適化・SMT モデリングインターフェース（LP, MIP, 凸QP, SMT）。TypeScript でモデルを記述し、HiGHS・Z3・GLPK でローカル求解。
  image:
    src: /washi-logo.svg
    alt: WaSHI Emblem
  actions:
    - theme: brand
      text: はじめに
      link: /ja/getting-started/
    - theme: alt
      text: ドキュメント
      link: /ja/guide/variables
    - theme: alt
      text: Playground ↗
      link: https://ohtaman.github.io/washi/demo/

features:
  - icon: ✍️
    title: 代数的なモデル記述 (expr)
    details: タグ付きテンプレート（expr`30 * ${x} + 50 * ${y} <= 40`）や内積（dot）・総和（sum）により、${...} を型付きの変数参照として直接バインドして定式化。
    link: /ja/guide/expressions
    linkText: 数式の記述ガイド
  - icon: ⚙️
    title: ソルバーアダプター機構
    details: 共通のモデリング API から標準搭載の HiGHS（LP/MIP/凸QP）およびオプションの Z3（SMT・論理制約・競合診断）、GLPK を切り替え可能。
    link: /ja/solvers/
    linkText: ソルバー比較
  - icon: 🌐
    title: WebAssembly によるローカル実行
    details: Python バックエンドや C/C++ のネイティブビルドなしで Node.js やブラウザの Web Worker 上で動作。静的アセットとして配信でき、ブラウザ内 LLM とも連携可能。
    link: /ja/getting-started/runtimes
    linkText: ランタイム環境設定
  - icon: 🔍
    title: 矛盾制約の特定 (unsatCore)
    details: 名前付き制約と Z3 アダプターを用いて、実行不可能（Infeasible）なモデルの矛盾する制約の部分集合（unsatCore）を抽出。
    link: /ja/examples/unsat-core
    linkText: Unsat Core の実例
---

<div style="max-width: 800px; margin: 40px auto;">

## クイックコード例

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

// 1. モデルの作成
const m = new Model("木工製品の利益最大化");

// 2. 決定変数の定義（整数変数）
const desks = m.integer("机", { lb: 0 });
const chairs = m.integer("椅子", { lb: 0 });

// 3. 目的関数の設定（机 $30、椅子 $50 の利益最大化）
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));

// 4. 制約条件の追加（木材と労働力の上限）
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "木材上限");
m.constraint(expr`2 * ${desks} + ${chairs} <= 50`, "労働力上限");

// 5. WebAssembly (HiGHS) による求解
await m.solve();

console.log(`生産量: 机=${desks.value}台, 椅子=${chairs.value}台`);
console.log(`最大利益: $${m.objectiveValue}`);
```

</div>
