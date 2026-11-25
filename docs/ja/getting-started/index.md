# インストールと入門

**WaSHI**（WebAssembly-backed, Solver-independent, High-level modeling Interface）は、TypeScript / JavaScript 向けの数理最適化ライブラリです。Python の PuLP のような代数形式で、タグ付きテンプレート（`expr`）を使って線形・二次・論理の数式を記述できます。同梱の WebAssembly ソルバーにより、**Node.js 18+** やモダンブラウザ上でネイティブビルドなしに求解できます。

---

## 📦 インストール

`@ohtaman/washi` には外部依存ゼロの 2 つのソルバーが同梱されており、さらに 2 つのソルバーをオプションのピア依存パッケージとして追加できます。

| ソルバー | 導入方法 | 対応する問題クラスと特徴 |
| --- | --- | --- |
| **HiGHS** *(標準)* | `@ohtaman/washi` に同梱 | 線形計画（`LP`）・混合整数計画（`MIP`）・凸二次計画（`QP`）に対応。 |
| **Pumpkin** | `@ohtaman/washi` に同梱（`@ohtaman/washi/solvers/pumpkin` から読み込み） | 制約プログラミング（`CP`）と、有界整数・真偽値モデルでの厳密な `unsatCore` 抽出に対応。 |
| **Z3** | オプション（`z3-solver`） | SMT（Satisfiability Modulo Theories）、連続変数の論理制約、連続変数を含むモデルでの厳密な `unsatCore` 抽出に対応。 |
| **GLPK** | オプション（`glpk.js`） | GPL-3.0 ライセンスの代替ソルバー（`LP` / `MIP` に対応）。 |

**充足不能コア（`unsatCore`）** とは、同時には満たせない制約の部分集合を指します（名前を付けておくと原因箇所を特定しやすくなります）。`m.check()` は標準の HiGHS で矛盾する制約を `conflicts` に報告し、Pumpkin と Z3 ではさらに厳密な `unsatCore` を抽出します。

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
npm install z3-solver   # オプション: SMT 論理制約および連続変数を含むモデルの unsatCore 診断用
npm install glpk.js     # オプション: GLPK ソルバー用（GPL-3.0）
```

ブラウザで Z3 を使う場合は、セキュアコンテキストと Cross-Origin Isolation ヘッダーが必要です。対象ヘッダーは `Cross-Origin-Opener-Policy` と `Cross-Origin-Embedder-Policy`（略称 `COOP`/`COEP`）で、設定手順は [Cross-Origin Isolation 設定](./cross-origin.md) にまとめています。

---

## 🚀 クイックスタート

以下の生産計画モデルでは、木材と労働時間の上限のもとで机と椅子の生産台数を決め、総利益を最大化します：

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

// 3. 求解（同梱の HiGHS / WebAssembly）と解の検証
const status = await m.solve();
if (m.hasPrimalSolution) {
  const report = m.verify();
  console.log(status, report.valid); // "Optimal", true
  console.log(`利益: ${m.objectiveValue} (机=${desks.value}, 椅子=${chairs.value})`); // 1100 (机=20, 椅子=10)
}
```

- **有限の上下限**: `m.continuous()`・`m.integer()` で範囲が分かっている場合は有限の `lb`・`ub` を指定します。MIP 定式化を引き締め、`M` を省略した `m.indicator()` でも必須になります。
- **明示的な登録と命名**: `` expr`...` `` で数式を作るだけではモデルに追加されず、`m.objective()` や `m.constraint()` の呼び出しが必要です。制約に名前を付けておくと `m.check()` の矛盾診断が読みやすくなります。
- **安全な読み出しと検証**: `.value` を参照する前に必ず `m.hasPrimalSolution` を確認し、`m.verify()` で上下限・整数性・制約の充足を独立に検証します。

---

## 🧭 次のステップ

### 開発スタイルを選ぶ

- **AI エージェントでモデルを構築**: [AI コーディングエージェントでの開発](./coding-agents.md) — `npx skills add ohtaman/washi`、`llms.txt` / Context7 連携、実用プロンプト集
- **TypeScript で直接モデルを書く**: [モデリングガイド](../guide/variables.md) — 配列・辞書変数、`sum` / `dot` 集計、論理制約、矛盾診断

### リファレンスと実践例

- **[実践例・サンプル集](../examples/)**: シフト作成からポートフォリオ最適化（QP）まで、数理最適化・CP・SMT の 12 の実践レシピと API 逆引き
- **[ソルバーの比較と切り替え](../solvers/)**: 同梱の HiGHS・Pumpkin とオプションの Z3・GLPK の比較表
- **[ランタイム環境とデプロイ構成](./runtimes.md)**: Node.js、Vite / Next.js、CDN、単一 HTML、デスクトップ・モバイル WebView での構成例
