# ソルバー概要

WaSHI は、ソルバーを切り替えられるプラグイン構造を採用しています。共通の代数モデリング API でモデルを一度記述すれば、問題クラスや実行環境の制約に合わせて最適なバックエンドを選べます。

---

## ソルバー比較表

| ソルバー | ライセンス | 対応問題クラス・変数 | 主な用途 | 提供形態と前提条件 |
| :--- | :--- | :--- | :--- | :--- |
| **[HiGHS](./highs.md)** | **MIT** | **LP, MIP, 凸 QP**（連続・整数・真偽値） | 実務・本番環境の数理最適化、オペレーションズ・リサーチ、凸 QP によるポートフォリオ最適化 | **同梱デフォルト**（追加依存・インポート不要。個別 API は `@ohtaman/washi/solvers/highs`） |
| **[Pumpkin](./pumpkin.md)** | **MIT** | **CP、命題論理**（有界な整数・真偽値のみ、`Continuous` 不可） | 非重複制約付きスケジューリング、CP グローバル制約、離散モデルの `unsatCore` | **同梱**（`{ solver: "pumpkin" }`、追加依存・インポート不要。個別 API は `@ohtaman/washi/solvers/pumpkin`） |
| **[Z3](./z3.md)**（`z3-solver` 経由） | **MIT** | **SMT、SAT、LP/MIP**（連続・整数・真偽値） | 連続変数や小数の係数・定数を含む論理ルール、連続・整数混在モデルの矛盾診断（`unsatCore`） | **オプション**（`@ohtaman/washi/solvers/z3`、要 `z3-solver`）。ブラウザでは Secure Context（`HTTPS` / `localhost`）と `COOP`/`COEP` ヘッダーが必要 |
| **[GLPK](./glpk.md)**（`glpk.js` 経由） | **GPL-3.0** | **LP, MIP**（連続・整数） | 学術ベンチマーク、既存 GLPK モデルとの互換検証 | **オプション**（`@ohtaman/washi/solvers/glpk`、要 `glpk.js`。GPL-3.0 ライセンスに注意） |
| **Mock**（`MockSolver`） | **MIT** | *任意*（固定応答スタブ） | WebAssembly を読み込まずに高速実行できる CI・単体テスト | **標準搭載**（`solver: "mock"` または `new MockSolver(...)`） |

---

## ソルバーの指定方法

同梱の **HiGHS**（デフォルト）と **Pumpkin**（`{ solver: "pumpkin" }`）は追加インポートなしでそのまま使えます。オプションのプラグイン型ソルバー（**Z3**・**GLPK**）を使う場合のみあらかじめインポートし、`Model` の作成時、または `solve()` / `check()` 呼び出し時に使用するソルバーを指定します。

```typescript
import { Model, MockSolver, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";
import "@ohtaman/washi/solvers/glpk";

// 1. Model 作成時にソルバーを指定（HiGHS がデフォルト、Pumpkin も追加インポート不要）
const m = new Model({ solver: "highs" });
const x = m.integer("x", { lb: 0, ub: 10 });
m.objective(maximize(expr`${x}`));

// 2. solve() / check() の呼び出しごとにソルバーを切り替え
await m.solve({ solver: "highs" });
await m.solve({ solver: "glpk" });
// check() は目的関数を無視し、制約の充足可能性のみを判定
await m.check({ solver: "pumpkin" });
await m.check({ solver: "z3" });

// 3. WebAssembly を読み込まない単体テスト向け MockSolver
const mock = new MockSolver({ status: "Optimal", objectiveValue: 10, values: { x: 10 } });
await m.solve({ solver: mock });
```

`MockSolver` を使ったテストパターンは [矛盾診断・解の検証・デバッグ](../guide/unsat-core.md) を参照してください。

---

## 各ソルバーの詳細ガイド

- [HiGHS ガイド](./highs.md): Web Worker バックグラウンド実行、MIP ギャップ許容値、凸二次計画（QP）、進捗イベントと中断。
- [Pumpkin ガイド](./pumpkin.md): 同梱 CP / LCG（Lazy Clause Generation）ソルバー、グローバル制約、ウォームスタート、離散モデルの `unsatCore` 抽出。
- [Z3 ガイド](./z3.md): SMT 論理制約、`Continuous`・小数を含むルール、矛盾診断、`COOP`/`COEP` 設定。
- [GLPK ガイド](./glpk.md): GLPK アダプターの使い方、GPL-3.0 ライセンス上の注意点、ステータスマッピング。
- [カスタムソルバー開発](./custom-solver.md): 商用・自社製ソルバー、クラウド REST API、独自 WASM エンジンをプラグインとして統合する手順。
