---
layout: home

hero:
  name: 'WaS<span class="brand-hi">HI</span>'
  text: "TypeScriptのための数理最適化モデラー"
  tagline: WebAssembly 代数モデリングシステム（LP, MIP, QP, SMT）。Node.js、ブラウザ、Bun、Deno、Next.js でネイティブな高速最適化を実現。
  image:
    src: /washi-logo.svg
    alt: WaSHI Emblem
  actions:
    - theme: brand
      text: はじめに
      link: /ja/getting-started/
    - theme: alt
      text: Playground ↗
      link: https://ohtaman.github.io/washi/demo/
    - theme: alt
      text: GitHub
      link: https://github.com/ohtaman/washi

features:
  - icon: 🌐
    title: 100% クライアント完結 & サーバー費用ゼロ
    details: WebAssembly 上で工業グレードの最適化問題を全自動で求解。機密データをサーバーに送らず、オフラインでもセキュアに動作します。
  - icon: ✍️
    title: 直感的な代数モデリング
    details: 直感的なドメイン変数（m.binary, m.integer, m.continuous）、数式テンプレート（expr`...`, c`...`）、ベクトル集計（dot, sum）、宣言的な m.constraint() で自然に定式化。
  - icon: ⚡
    title: 産業用マルチソルバーアーキテクチャ
    details: 高速な HiGHS（LP/MIP/QP）を標準搭載。さらに Z3（SMT論理制約・競合診断）や GLPK をプラグインとして自由に切り替え可能。
  - icon: 🔍
    title: 競合制約の自動診断 (Unsat Core)
    details: 制約同士が矛盾して実行不可能（Infeasible）になった際、Z3 エンジンが原因となっている制約の最小集合を自動特定します。
---

<div style="max-width: 800px; margin: 40px auto;">

## クイックコード例

```typescript
import { Model, expr, c, maximize } from "@ohtaman/washi";

// 1. モデルの作成
const m = new Model("木工製品の利益最大化");

// 2. 決定変数の定義（整数変数）
const desks = m.integer("机", { lb: 0 });
const chairs = m.integer("椅子", { lb: 0 });

// 3. 目的関数の設定（机 $30、椅子 $50 の利益最大化）
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));

// 4. 制約条件の追加（木材と労働力の上限）
m.constraint(c`${desks} + 2 * ${chairs} <= 40`, "木材上限");
m.constraint(c`2 * ${desks} + ${chairs} <= 50`, "労働力上限");

// 5. WebAssembly (HiGHS) による求解
await m.solve();

console.log(`生産量: 机=${desks.value}台, 椅子=${chairs.value}台`);
console.log(`最大利益: $${m.objectiveValue}`);
```

</div>
