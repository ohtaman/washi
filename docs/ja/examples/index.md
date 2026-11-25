# 実践サンプル集・API 逆引き

WaSHI を使った数理最適化と論理検証のサンプル集です。各ページ内でコードをそのまま実行できるほか、対応するサンプルは [Playground](https://washi.ohtaman.dev/demo/) で自由に編集して試せます。

## サンプル一覧

| サンプル | 問題クラス | ソルバー | 主な API | 概要 | Playground / ガイド |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[生産計画問題](./production.md)** | 整数計画 (MIP) | HiGHS | `m.integer()`, `m.constraint()`, `expr` | 整数変数の定義、`expr` テンプレートによる数式記述、リソース上限下での利益最大化。 | [Playground](https://washi.ohtaman.dev/demo/?preset=production) |
| **[0-1 ナップサック問題](./knapsack.md)** | 0-1 MIP | HiGHS | `m.binary(keys)`, `expr` (`dot`), `m.constraint()` | 1 次元キー配列からの 0-1 変数の定義と、`expr` 内の `dot()` による内積計算。 | [Playground](https://washi.ohtaman.dev/demo/?preset=knapsack) |
| **[輸送・物流ネットワーク問題](./transportation.md)** | LP | HiGHS | `m.continuous(rows, cols)`, `expr` (`sum`, `dot`), `m.constraint()` | `ship[factory][store]` のような 2 次元行列の決定変数と、行・列方向の供給上限・需要充足制約。 | [Playground](https://washi.ohtaman.dev/demo/?preset=transportation) |
| **[栄養問題と感度分析](./diet-sensitivity.md)** | LP | HiGHS | `constr.dual`, `constr.slack`, `var.reducedCost` | 求解後の双対変数（潜在価格）、スラック（余裕量）、被約費用の読み取り。 | [Playground](https://washi.ohtaman.dev/demo/?preset=diet_sensitivity) |
| **[スタッフのシフト作成](./shift-scheduling.md)** | 0-1 MIP + Unsat Core | HiGHS + Z3* | `m.binary(staff, days)`, `m.check()`, `m.unsatCore` | 5 名×7 日のシフト作成と、希望休が衝突した際の Z3 の `unsatCore` による矛盾診断。 | [Playground](https://washi.ohtaman.dev/demo/?preset=shift_scheduling) |
| **[EC カートのクーポン最適化](./ecommerce-coupons.md)** | Indicator 制約 MIP | HiGHS | `m.indicator()`, `expr` (`sum`, `dot`), `m.constraint()` | `m.indicator()` による最低購入金額条件・併用不可ルールの記述と、クーポン適用・追加購入の同時最適化。 | [Playground](https://washi.ohtaman.dev/demo/?preset=cart_coupon) |
| **[ポートフォリオ最適化 (QP)](./portfolio-qp.md)** | 凸二次計画 (QP) | HiGHS | `m.continuous()`, `m.constraint()`, `dot()`, `QuadExpr` | `QuadExpr` を用いたマーコウィッツ平均・分散モデル（$\mathbf{w}^T \boldsymbol{\Sigma} \mathbf{w}$ の最小化）。 | [Playground](https://washi.ohtaman.dev/demo/?preset=portfolio_qp) |
| **[プロジェクトスケジューリング (CP)](./project-scheduling.md)** | CP + Unsat Core | Pumpkin | `m.integer()`, `disjoint()`, `cumulative()`, `max()`, `m.check()` | 共有設備（リグ）の排他制約と 3 名の人員上限を伴う 6 工程のスケジューリング、および納期矛盾の診断。 | [Playground](https://washi.ohtaman.dev/demo/?preset=project_scheduling) |
| **[セキュリティポリシー検証 (SMT)](./smt-security.md)** | SMT | Z3* | `m.bool()`, `implies()`, `.and()`, `not()`, `m.check()` | 命題変数（`BoolVar`）と論理演算（`implies()`, `.and()`, `not()`）に整数変数の範囲制約を組み合わせた検証。 | [Playground](https://washi.ohtaman.dev/demo/?preset=smt_security) |
| **[制約矛盾の診断 (Unsat Core)](./unsat-core.md)** | SMT / MIP + Unsat Core | Z3* + HiGHS | `m.constraint()`, `m.check()`, `m.conflicts` | 人員要件と予算上限が衝突した際の、矛盾する制約の部分集合の抽出。 | [Playground](https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat) |
| **[車両配送計画問題 (CVRP)](./vehicle-routing.md)** | 組合せ最適化（Dantzig-Wolfe 分解） | HiGHS | `m.solveColumnGeneration()`, `pricing`, `constr.dual` | 双対変数（潜在価格）を用いて配送ルートを動的に生成し、最小車両数を決定。 | [分解法](../guide/decomposition.md) |
| **[巡回セールスマン問題 (TSP)](./traveling-salesperson.md)** | 組合せ最適化（Benders 分解） | HiGHS | `m.solveBenders()`, `subproblem` | 割当緩和（次数制約緩和）から始め、部分巡回路を除去する Benders カットを動的に追加。 | [分解法](../guide/decomposition.md) |

> [!NOTE]
> **ソルバーの前提条件**: HiGHS と Pumpkin は WaSHI に同梱されています。`Z3*` のサンプルはオプションの `z3-solver`（ブラウザでは `COOP`/`COEP` ヘッダーも必要）を使います。GLPK を使う場合は `glpk.js`（GPL-3.0）が必要です。

## WaSHI API・機能からの逆引きインデックス

特定のモデリング API やソルバー機能の使い方・記述例を探すときに利用できます。

| 機能 / API | 用途 | サンプル / ガイド | Node.js ソースコード |
| :--- | :--- | :--- | :--- |
| ``m.constraint(expr`...`)`` | テンプレートリテラルによる制約記述 | [生産計画問題](./production.md) | [`01-production-planning.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) |
| `m.binary(keys)` / `m.continuous(keys)` | 1 次元キー配列による辞書形式の決定変数宣言 | [0-1 ナップサック問題](./knapsack.md) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts) |
| `m.continuous(rows, cols)` / `m.binary(rows, cols)` | 2 次元（行列形式）の決定変数の宣言 | [輸送・物流ネットワーク問題](./transportation.md), [スタッフのシフト作成](./shift-scheduling.md) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts), [`11-shift-scheduling.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) |
| ``expr`dot(${A}, ${X})` `` / `dot(A, X)` | ベクトル・行列の内積計算 | [0-1 ナップサック問題](./knapsack.md), [輸送・物流ネットワーク問題](./transportation.md), [ポートフォリオ最適化 (QP)](./portfolio-qp.md) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts), [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `constr.dual` / `constr.slack` | 双対変数（潜在価格）とスラック（余裕量）の取得 | [栄養問題と感度分析](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `var.reducedCost` | LP における変数の被約費用の取得 | [栄養問題と感度分析](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `m.indicator()` | 条件付き制約（Big-M 法による自動線形化） | [EC カートのクーポン最適化](./ecommerce-coupons.md) | [`12-ecommerce-coupon-optimizer.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) |
| `new QuadExpr()` | 二次目的関数（$\mathbf{x}^T \mathbf{Q} \mathbf{x}$、凸 QP 向け） | [ポートフォリオ最適化 (QP)](./portfolio-qp.md) | [`03-portfolio-qp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) |
| `m.bool()` / `implies()` | 命題論理・含意制約（SMT） | [セキュリティポリシー検証 (SMT)](./smt-security.md) | [`04-smt-security-rules.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) |
| `m.check()` / `m.conflicts` | 充足性チェックと矛盾診断（`conflicts` / `unsatCore`） | [制約矛盾の診断 (Unsat Core)](./unsat-core.md), [スタッフのシフト作成](./shift-scheduling.md) | [`05-unsat-core-diagnosis.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts), [`11-shift-scheduling.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/11-shift-scheduling.ts) |
| ハイブリッド Z3 SMT + HiGHS MIP | Z3 の論理検証後に HiGHS で容量最適化を実行 | [Z3 ガイド](../solvers/z3.md) | [`07-hybrid-smt-mip.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/07-hybrid-smt-mip.ts) |
| `m.solveColumnGeneration()` | Dantzig-Wolfe 列生成法 | [車両配送計画問題 (CVRP)](./vehicle-routing.md) | [`13-vehicle-routing-column-generation.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts) |
| `m.solveBenders()` | Benders 分解と遅延カット分離 | [巡回セールスマン問題 (TSP)](./traveling-salesperson.md) | [`14-traveling-salesperson-benders.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts) |
| `disjoint()` / `cumulative()` / `max()` | スケジューリング用グローバル制約と最大完了時刻（メイクスパン）の最小化 | [プロジェクトスケジューリング (CP)](./project-scheduling.md), [制約プログラミング (CP) モデリング](../guide/constraint-programming.md) | [`15-project-scheduling-cp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts) |
| `distinct()` / `allowed()` / `at()` | CP の全相異制約（all-different）・テーブル制約・要素制約（element） | [制約プログラミング (CP) モデリング](../guide/constraint-programming.md), [数式の記述](../guide/expressions.md) | — |
| `solver: "pumpkin"` | 同梱の Pumpkin による CP スケジューリングと離散モデルの矛盾診断 | [プロジェクトスケジューリング (CP)](./project-scheduling.md), [Pumpkin ガイド](../solvers/pumpkin.md) | [`15-project-scheduling-cp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts) |
| `solver: "glpk"` | オプションの `glpk.js`（GPL-3.0）による LP / MIP 求解 | [GLPK ガイド](../solvers/glpk.md) | [`08-glpk-solver-plugin.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/08-glpk-solver-plugin.ts) |

## ローカル環境（Node.js）での実行方法

各サンプルのスクリプトはリポジトリの [`examples/node/`](https://github.com/ohtaman/washi/tree/main/examples/node) に格納されています。クローンして依存パッケージをインストールすると、`npx tsx` で直接実行できます（Z3 や GLPK を使うサンプルには別途オプションパッケージの追加が必要です）。

```bash
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/02-knapsack-problem.ts
npx tsx examples/node/03-portfolio-qp.ts
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/07-hybrid-smt-mip.ts
npx tsx examples/node/08-glpk-solver-plugin.ts
npx tsx examples/node/09-transportation-problem.ts
npx tsx examples/node/10-diet-sensitivity.ts
npx tsx examples/node/11-shift-scheduling.ts
npx tsx examples/node/12-ecommerce-coupon-optimizer.ts
npx tsx examples/node/13-vehicle-routing-column-generation.ts
npx tsx examples/node/14-traveling-salesperson-benders.ts
npx tsx examples/node/15-project-scheduling-cp.ts
```
