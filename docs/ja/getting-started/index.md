# インストールと入門

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）は、TS/JS 向けの最適化基盤です。Python の PuLP のようにタグ付きテンプレート（`expr`）で数式を記述でき、同梱の WebAssembly ソルバーで **Node.js 18+** とブラウザからそのまま求解できます。

---

## 📦 インストール

`@ohtaman/washi` をインストールすると、外部依存ゼロの 2 つのソルバーが標準で利用できます。さらに 2 つのソルバーをオプションのピア依存として追加できます。

| ソルバー | 導入方法 | 対応する問題クラスと特徴 |
| --- | --- | --- |
| **HiGHS** *(標準)* | `@ohtaman/washi` に同梱 | 線形計画・混合整数計画・凸二次計画 — `LP` / `MIP` / `QP` に対応。 |
| **Pumpkin** | `@ohtaman/washi/solvers/pumpkin` に同梱 | 制約プログラミング（`CP`）と、有界整数・真偽値モデルでの `unsatCore` 抽出に対応。 |
| **Z3** | オプション（`z3-solver`） | 充足可能性モジュロ理論（`SMT`）、連続変数の論理制約、厳密な `unsatCore` 抽出に対応。 |
| **GLPK** | オプション（`glpk.js`） | GPL-3.0 ライセンスの代替 LP / MIP ソルバー。 |

**充足不能コア（`unsatCore`）**とは、同時には満たせない名前付き制約の部分集合を指します。Pumpkin と Z3 のいずれも `m.check()` から `unsatCore` を抽出できます。

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

**Z3** または **GLPK** が必要な場合は、オプションのピア依存パッケージを追加します：

```bash
npm install z3-solver   # オプション: SMT 論理制約および連続変数の Unsat Core 診断用
npm install glpk.js     # オプション: GLPK ソルバー用 (GPL-3.0)
```

ブラウザで Z3 を使う場合は、セキュアコンテキストと Cross-Origin Isolation ヘッダーが必要です。対象ヘッダーは `Cross-Origin-Opener-Policy` と `Cross-Origin-Embedder-Policy`（略称 `COOP`/`COEP`）で、設定手順は [Cross-Origin Isolation 設定](./cross-origin.md) にまとめています。

AI コーディングエージェントを利用する場合は、[AI コーディングエージェントでの開発](./coding-agents.md) で `npx skills add ohtaman/washi`、`llms.txt`、実用プロンプト集を確認してください。

---

## 🚀 クイックスタート

WaSHI の最適化モデルは、常に次の 3 ステップで構成します。まず有限の上下限を持つ決定変数を宣言し、次に目的関数と名前付き制約を登録し、最後に求解と解の検証を行います。

以下の生産計画の例では、木材と労働時間の上限のもとで机と椅子の利益を最大化します：

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
  const report = m.verify();
  console.log(status, report.valid); // "Optimal", true
  console.log(`利益: ${m.objectiveValue} (机=${desks.value}, 椅子=${chairs.value})`); // 1100 (机=20, 椅子=10)
}
```

1. **決定変数を定義する**: `m.continuous()`・`m.integer()`・`m.binary()` で変数を作成します。範囲が分かっている場合は有限の `lb`・`ub` を指定します。
2. **目的関数と制約を記述する**: `` expr`...` `` で数式を記述します。制約に分かりやすい名前を付けておくと、実行不能時の原因特定が容易になります。
3. **求解して検証する**: `await m.solve()` で同梱の HiGHS を実行します。`m.hasPrimalSolution` を確認後に `.value` を読み、`m.verify()` で制約充足を検証します。

---

## 🧭 次のステップ

### 開発スタイルを選ぶ

- **AI エージェントで構築**: [AI コーディングエージェントでの開発](./coding-agents.md) — `npx skills add` と実用プロンプト集
- **TypeScript で直接モデルを書く**: [モデリングガイド](../guide/variables.md) — 配列・辞書変数、`sum` / `dot` 集計、論理制約、競合診断

### リファレンスと実践例

- **[具体例と API 早見表](../examples/)**: シフト作成からポートフォリオ QP まで、12 の実践レシピ
- **[ソルバーの比較と切り替え](../solvers/)**: 同梱の HiGHS・Pumpkin とオプションの Z3・GLPK の比較表
- **[ランタイム環境設定](./runtimes.md)**: Node.js、Vite / Next.js、CDN、単一 HTML、デスクトップ・モバイル WebView での設定
