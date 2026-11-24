# ソルバー概要

WaSHI は、ソルバーを切り替えられるプラグイン構造を採用しています。共通の代数モデリング API でモデルを 1 度記述すれば、問題クラスや実行環境に合わせて最適なバックエンドを選べます。

---

## ソルバー比較マトリクス

| ソルバー | ライセンス | 対応問題クラス | 最適な用途 | 提供形態と前提条件 |
| :--- | :--- | :--- | :--- | :--- |
| **[HiGHS](https://github.com/ERGO-Code/HiGHS)** | **MIT** | **LP, MIP, 凸QP** | 実務規模の最適化、生産計画、ポートフォリオ最適化 | **標準搭載**（設定不要） |
| **[Pumpkin](https://github.com/ConSol-Lab/Pumpkin)** | **MIT** | **CP, LCG, 論理, 有界整数** | 非重複スケジューリング、CP グローバル制約、離散モデルの `unsatCore` | **同梱プラグイン**（`@ohtaman/washi/solvers/pumpkin`）。有界な整数・真偽変数のみ対応（`Continuous` 変数は不可） |
| **[Z3](https://github.com/Z3Prover/z3)**（`z3-solver` 経由） | **MIT** | **SMT, SAT, 論理, MIP** | 連続変数・小数を含む論理ルール、矛盾診断（`unsatCore`） | **オプション**（`@ohtaman/washi/solvers/z3`、要 `z3-solver`）。ブラウザでは `COOP`/`COEP` ヘッダーが必要 |
| **[GLPK](https://www.gnu.org/software/glpk/)**（`glpk.js` 経由） | **GPL-3.0** | **LP, MIP** | 学術ベンチマーク、既存 GLPK モデルとの互換検証 | **オプション**（`@ohtaman/washi/solvers/glpk`、要 `glpk.js`・GPL-3.0 に注意） |
| **Mock**（`MockSolver`） | **MIT** | *任意* | WebAssembly を読み込まない CI 向けの高速な単体テスト | **標準搭載**（`solver: "mock"` または `new MockSolver(...)`） |

---

## ソルバーの指定方法

プラグインソルバーはモジュール先頭でインポートし、`Model` の作成時、または `solve()` / `check()` 呼び出し時にソルバーを指定します。

```typescript
import { Model, MockSolver, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";
import "@ohtaman/washi/solvers/z3";
import "@ohtaman/washi/solvers/glpk";

// 1. Model 作成時にデフォルトソルバーを指定（HiGHS は標準搭載）
const m = new Model({ solver: "highs" });
const x = m.integer("x", { lb: 0, ub: 10 });
m.objective(maximize(expr`${x}`));

// 2. solve() / check() の呼び出しごとにソルバーを切り替え
await m.solve({ solver: "highs" });
await m.solve({ solver: "glpk" });
await m.check({ solver: "pumpkin" });
await m.check({ solver: "z3" });

// 3. WebAssembly を読み込まない単体テスト向け MockSolver
const mock = new MockSolver({ status: "Optimal", objectiveValue: 10, values: { x: 10 } });
await m.solve({ solver: mock });
```

`MockSolver` を使ったテスト手順は [矛盾診断・解の検証・デバッグ](../guide/unsat-core.md) を参照してください。

---

## 各ソルバーの詳細ガイド

- [HiGHS ガイド](./highs.md): Web Worker バックグラウンド実行、MIP 許容誤差、凸二次計画 (QP)、進捗イベントと中断。
- [Pumpkin ガイド](./pumpkin.md): 同梱 CP / LCG（Lazy Clause Generation）ソルバー、グローバル制約、ウォームスタート、離散モデルの `unsatCore` 抽出。
- [Z3 ガイド](./z3.md): SMT 論理アサーション、`Continuous`・小数を含むルール、矛盾診断、`COOP`/`COEP` 設定。
- [GLPK ガイド](./glpk.md): GLPK アダプターの使い方、GPL-3.0 ライセンス上の注意点、ステータスマッピング。
- [カスタムソルバー開発](./custom-solver.md): 社内ソルバー、クラウド REST API、独自 WASM エンジンをプラグインとして統合する手順。
