---
layout: home

hero:
  name: 'WaS<span class="brand-hi">HI</span>'
  text: "TypeScript 数理最適化モデラー"
  tagline: "PythonのPuLPのように直感的な数式で定式化できるTypeScript向け代数モデラー。WebAssembly（HiGHS・Z3・GLPK）を搭載し、Pythonサーバーやネイティブビルド不要でLP・混合整数計画法（MIP）・凸QP・SMTをブラウザやNode.jsで高速に求解します。"
  image:
    src: /washi-logo.svg
    alt: WaSHI Emblem
  actions:
    - theme: brand
      text: はじめに
      link: /ja/getting-started/
    - theme: alt
      text: ショーケース
      link: /ja/showcase/

features:
  - icon: ✍️
    title: 代数的なモデル記述 (expr)
    details: タグ付きテンプレート（expr`30 * ${x} + 50 * ${y} <= 40`）や内積（dot）・総和（sum）により、${...} を型付きの変数参照として直接バインドして定式化。
    link: /ja/guide/expressions
    linkText: 数式の記述
  - icon: ⚙️
    title: ソルバーアダプター機構
    details: 共通のモデリング API から標準搭載の HiGHS（LP/MIP/凸QP）およびオプションの Z3（SMT・論理制約・競合診断）、GLPK を切り替え可能。
    link: /ja/solvers/
    linkText: ソルバー
  - icon: 🌐
    title: WebAssembly によるローカル実行
    details: Python バックエンドや C/C++ のネイティブビルドなしで Node.js やブラウザの Web Worker 上で動作。静的アセットとして配信でき、ブラウザ内 LLM とも連携可能。
    link: /ja/getting-started/runtimes
    linkText: ランタイム環境設定
  - icon: 🔍
    title: 矛盾制約の特定 (unsatCore)
    details: 名前付き制約と Z3 アダプターを用いて、実行不可能（Infeasible）なモデルの矛盾する制約の部分集合（unsatCore）を抽出。
    link: /ja/guide/unsat-core
    linkText: 競合制約診断 (Unsat Core)
---

<div style="max-width: 800px; margin: 40px auto;">

## クイックコード例

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

// 1. モデルの作成
const m = new Model("木工製品の利益最大化");

// 2. 決定変数の定義（現実的な上下限を設定した整数変数）
const desks = m.integer("机", { lb: 0, ub: 100 });
const chairs = m.integer("椅子", { lb: 0, ub: 100 });

// 3. 目的関数の設定（机 $30、椅子 $50 の利益最大化）
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));

// 4. 制約条件の追加（木材と労働力の上限）
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "木材上限");
m.constraint(expr`2 * ${desks} + ${chairs} <= 50`, "労働力上限");

// 5. WebAssembly (HiGHS) による求解
await m.solve();

if (m.hasPrimalSolution) {
  console.log(`生産量: 机=${desks.value}台, 椅子=${chairs.value}台`);
  console.log(`最大利益: $${m.objectiveValue}`);
}
```

## ドキュメント一覧

<div class="tip custom-block" style="padding-top: 8px;">

- **はじめに**: [概要とインストール](/ja/getting-started/) · [AI コーディングエージェント向けクイックリファレンス](/ja/getting-started/ai-agents) · [ランタイム環境設定](/ja/getting-started/runtimes) · [Cross-Origin Isolation 設定](/ja/getting-started/cross-origin)
- **モデリングガイド**: [変数と上下限](/ja/guide/variables) · [数式の記述 (expr, dot, sum)](/ja/guide/expressions) · [目的関数](/ja/guide/objectives) · [制約条件](/ja/guide/constraints) · [競合制約診断 (Unsat Core)](/ja/guide/unsat-core) · [分解法 (列生成・Benders)](/ja/guide/decomposition)
- **ソルバー接続**: [ソルバー概要と比較](/ja/solvers/) · [HiGHS (標準搭載)](/ja/solvers/highs) · [Z3 (SMT)](/ja/solvers/z3) · [GLPK (LP/MIP)](/ja/solvers/glpk) · [カスタムソルバー実装](/ja/solvers/custom-solver)
- **定式化の具体例**: [具体例一覧と API 早見表](/ja/examples/) · [生産計画](/ja/examples/production) · [ナップサック問題](/ja/examples/knapsack) · [輸送ネットワーク計画](/ja/examples/transportation) · [献立問題と感度分析](/ja/examples/diet-sensitivity) · [シフトスケジューリング](/ja/examples/shift-scheduling) · [EC クーポン最適化](/ja/examples/ecommerce-coupons) · [ポートフォリオ最適化 (QP)](/ja/examples/portfolio-qp) · [SMT セキュリティポリシー検証](/ja/examples/smt-security) · [競合制約診断 (Unsat Core)](/ja/examples/unsat-core) · [配送計画問題 (列生成法)](/ja/examples/vehicle-routing) · [巡回セールスマン問題 (Benders 分解)](/ja/examples/traveling-salesperson)
- **インタラクティブ Playground・アプリ**: [ショーケース一覧](/ja/showcase/) · <a href="/washi/demo/" target="_self">WaSHI Playground</a> · <a href="/washi/apps/ai-shift/" target="_self">ナーススケジューリング AI Copilot</a> · <a href="/washi/apps/ai-timetable/" target="_self">大学時間割編成 AI Copilot</a> · <a href="/washi/games/demon-castle-shift/" target="_self">魔王城の24時間警備シフト</a> · <a href="/washi/games/mofumofu-sheep/" target="_self">もふもふ羊の牧場囲い</a> · <a href="/washi/games/titan-pack/" target="_self">TITAN PACK</a>

</div>

</div>
