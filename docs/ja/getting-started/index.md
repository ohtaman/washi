# インストールと入門

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）は、Python の **PuLP** のような代数モデリングを TypeScript / JavaScript で提供する数理最適化・制約プログラミングライブラリです。タグ付きテンプレート（`expr`）で直感的に数式を記述でき、WebAssembly ソルバー（**HiGHS**, **Pumpkin**, **Z3**, **GLPK**）によって **Node.js やブラウザ** でそのまま求解できます。

---

## 📦 インストール

標準の **HiGHS** ソルバー（LP / MIP / 凸QP）と **Pumpkin** CP/LCG ソルバー（`@ohtaman/washi/solvers/pumpkin`）はいずれも外部依存ゼロで本体に同梱されており、これだけで動作します：

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

## 🚀 クイックスタート

生産計画問題を例に、WaSHI の基本的な流れ（1. 変数定義 $\to$ 2. 目的関数・制約設定 $\to$ 3. 求解と結果確認）を見てみましょう：

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

1. **決定変数を定義する（`lb`, `ub`）**: `m.continuous()`・`m.integer()`・`m.binary()` で変数を定義します。上限・下限が分かっている場合は有限の `lb`・`ub` を指定しておきます。
2. **`expr` で目的関数と制約を記述する**: `` expr`...` `` で数式をそのまま書けます。制約に名前を付けておくと、解なし（`Infeasible`）になったときの原因特定に役立ちます。
3. **求解して結果を確認・検証する（`solve`, `validateSolution`）**: `await m.solve()` で同梱の HiGHS ソルバーを実行します。`m.hasPrimalSolution` で解の有無を確認してから `.value` を読み取り、必要に応じて `m.validateSolution()` で境界や制約を満たしているか検証します。

---

## 🧭 次のステップ

- **[モデリングガイド](../guide/variables.md)**: 配列・辞書変数の作り方、総和 `sum()` や内積 `dot()`、論理制約や競合診断の書き方
- **[具体例と API 早見表](../examples/)**: 生産計画・シフト作成・ポートフォリオ最適化・配送計画など、12の実践レシピ
- **[ソルバーの比較と切り替え](../solvers/)**: 同梱の HiGHS・Pumpkin と、オプションの Z3・GLPK の特性比較
- **[ランタイム環境設定](./runtimes.md)**: Node.js、Vite / Next.js 等のバンドラー、CDN、静的ホスティングでの設定方法
