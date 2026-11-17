# インストールと入門

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）は、Python の **PuLP** のような代数モデリングを TypeScript / JavaScript で提供する数理最適化ライブラリです。タグ付きテンプレート（`expr`）で直感的に数式を記述でき、WebAssembly ソルバー（**HiGHS**, **Z3**, **GLPK**）によって **Node.js やブラウザ** でそのまま求解できます。

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("production");

// 1. 決定変数の定義（現実的な上下限 lb / ub を指定）
const desks = m.integer("desks", { lb: 0, ub: 100 });
const chairs = m.integer("chairs", { lb: 0, ub: 100 });

// 2. 目的関数と制約条件の設定
m.objective(maximize(expr`30 * ${desks} + 50 * ${chairs}`));
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_capacity");
m.constraint(expr`2 * ${desks} + ${chairs} <= 50`, "labor_capacity");

// 3. 求解（標準搭載の HiGHS WebAssembly）と解の検証
const status = await m.solve();
if (m.hasPrimalSolution) {
  const report = m.validateSolution();
  console.log(status, report.valid); // "Optimal", true
  console.log(`利益: ${m.objectiveValue} (机=${desks.value}, 椅子=${chairs.value})`); // 1100 (机=20, 椅子=10)
}
```

---

## 📦 インストール

標準の **HiGHS** ソルバー（LP / MIP / 凸QP）は本体に同梱されており、これだけで動作します：

::: code-group

```bash [npm]
npm install @ohtaman/washi
```

```bash [pnpm]
pnpm add @ohtaman/washi
```

```bash [yarn]
yarn add @ohtaman/washi
```

```bash [bun]
bun add @ohtaman/washi
```

:::

**Z3**（SMT 論理制約・Unsat Core 競合診断）や **GLPK** を使う場合のオプション依存パッケージ、および AI コーディングエージェント用スキルは必要に応じて追加します：

```bash
npm install z3-solver   # SMT論理制約および Unsat Core 競合診断用
npm install glpk.js     # GLPK ソルバー用 (GPL-3.0)

# AI コーディングエージェント用スキル (Claude Code, Cursor, Codex 等)
npx skills add ohtaman/washi
```

---

## 🔍 基本ワークフローの勘所

冒頭のコードで使われている、WaSHI の基本的なお作法は3点だけです：

1. **変数には現実的な上下限（`lb`, `ub`）を設定する**: `m.continuous` / `m.integer` / `m.binary` で変数を定義する際、有限の `lb`・`ub` を与えると MIP の前処理（Presolve）や論理制約の自動 Big-M 導出が強化されます。
2. **`expr` で目的関数と制約を記述する**: `` m.objective(maximize(expr`...`)) `` や `` m.constraint(expr`... <= ...`, "名前") `` のように記述します。制約に名前を付けておくと、解なし（Infeasible）になった際の原因特定にそのまま使えます。
3. **`hasPrimalSolution` の確認と `validateSolution()`**: `await m.solve()` の実行後、`m.hasPrimalSolution` で実行可能解の有無を確認してから各変数の `.value` を読み取ります。`m.validateSolution()` を呼ぶと、元の制約や整数条件を数値誤差の範囲で満たしているかを独立検証できます。

---

## 🧭 次のステップ

- **[モデリングガイド](../guide/variables.md)**: 配列・辞書変数の作り方、総和 `sum()` や内積 `dot()`、論理制約や競合診断（Unsat Core）の書き方
- **[具体例と API 早見表](../examples/)**: 生産計画・シフト作成・ポートフォリオ最適化・配送計画など、ブラウザ上でそのまま動かせる11の実践レシピ
- **[ソルバーの比較と切り替え](../solvers/)**: 標準搭載の HiGHS と、オプションの Z3・GLPK の特性比較
- **[ランタイム環境設定](./runtimes.md)**: Node.js、Vite / Next.js 等のバンドラー、CDN、静的ホスティングでの設定方法
