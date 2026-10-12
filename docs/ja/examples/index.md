# 実践例・サンプル集

WaSHI を使った数理最適化・論理検証のサンプル集です。各ページ内でそのまま実行して動作を確認できるほか、[Playground](https://ohtaman.github.io/washi/demo/) でコードを自由に編集して試すこともできます。

## サンプル一覧

| サンプル | 問題クラス | ソルバー | 主な API | 概要 | コード編集 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[生産計画問題](./production.md)** | LP / MIP | HiGHS | `m.integer()`, `m.constrain()`, `expr` | 変数の定義、テンプレートリテラルによる数式記述、リソース上限下での利益最大化。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=production) |
| **[0-1 ナップサック問題](./knapsack.md)** | 0-1 MIP | HiGHS | `m.binary(keys)`, `sum()`, `m.constrain()` | 1次元キー配列からの `Binary` 変数生成と、`sum()` による配列集計。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=knapsack) |
| **[輸送・物流ネットワーク](./transportation.md)** | LP | HiGHS | `m.continuous(rows, cols)`, `dot()`, `m.constrain()` | `ship[factory][store]` のような2次元マトリクス変数の生成と、行・列方向のフロー保存則。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=transportation) |
| **[栄養問題と感度分析](./diet-sensitivity.md)** | LP | HiGHS | `constr.dual`, `constr.slack`, `var.reducedCost` | 求解後に潜在価格（ボトルネックの特定）、余剰（スラック）、被約費用を取り出す方法。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity) |
| **[スタッフのシフト作成と競合診断](./shift-scheduling.md)** | 0-1 MIP + Unsat Core | HiGHS + Z3 | `m.binary(staff, days)`, `check()`, `unsatCore` | 8名×7日のシフト作成（必要人数・シニア配置・週上限・希望休）と、希望休が衝突した際の Z3 `unsatCore` による原因特定。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=shift_scheduling) |
| **[ECカートのクーポン最適適用](./ecommerce-coupons.md)** | Indicator MIP | HiGHS | `m.indicator()`, `sum()`, `m.constrain()` | `m.indicator()` を用いた最低購入金額条件、併用不可ルール、さらに追加購入による上位割引解放の同時計算。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=cart_coupon) |
| **[ポートフォリオ最適化](./portfolio-qp.md)** | 凸二次計画 (QP) | HiGHS | `m.continuous()`, `m.constrain()`, `dot()`, `QuadExpr` | マーコウィッツの平均・分散モデル（共分散リスクの最小化）。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=portfolio_qp) |
| **[セキュリティポリシー検証](./smt-security.md)** | SMT 論理 | Z3 | `m.addBoolVar()`, `m.constrain()`, `m.check()` | 命題変数（`BoolVar`）と論理演算（`implies`, `and`, `not`, `xor`）によるルール検証。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling) |
| **[制約矛盾の診断 (`unsatCore`)](./unsat-core.md)** | Unsat Core | Z3 | `m.constrain()`, `m.check()`, `m.unsatCore` | 人員要件と予算上限が衝突した際、矛盾を引き起こしている制約の部分集合を自動抽出。 | [Playground](https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat) |

## WaSHI API・機能からの逆引きインデックス

「この API の書き方を知りたい」という場合の逆引き表です。

| 機能 / API | 用途 | サンプルページ | Node.js ソースコード |
| :--- | :--- | :--- | :--- |
| ``m.constrain(expr`...`)`` | テンプレートリテラルによる直感的な制約記述 | [生産計画問題](./production.md) | [`01-production-planning.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) |
| `m.binary(keys)` / `m.continuous(keys)` | 1次元キー辞書による決定変数の宣言 | [0-1 ナップサック問題](./knapsack.md) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts) |
| `m.continuous(rows, cols)` / `m.binary(rows, cols)` | 2次元マトリクス決定変数の宣言 | [輸送・物流ネットワーク](./transportation.md), [シフト作成](./shift-scheduling.md) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `dot(matrix, vars2d)` / `dot(vector, vars)` | 内積・線形結合のワンライナー計算 | [輸送・物流ネットワーク](./transportation.md), [ポートフォリオ最適化](./portfolio-qp.md) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `constr.dual` / `constr.slack` | 潜在価格（Shadow Price）と余剰（Slack）の取得 | [栄養問題と感度分析](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `var.reducedCost` | 変数の被約費用（Reduced Cost）の取得 | [栄養問題と感度分析](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `m.indicator()` | 条件付き制約（Big-M 自動線形化） | [ECカートのクーポン最適適用](./ecommerce-coupons.md) | [`12-ecommerce-coupon-optimizer.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) |
| `new QuadExpr()` | 凸二次目的関数（$x^T Q x$） | [ポートフォリオ最適化](./portfolio-qp.md) | [`03-portfolio-qp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) |
| `m.addBoolVar()` / `.implies()` | 命題論理・含意制約（SMT） | [セキュリティポリシー検証](./smt-security.md) | [`04-smt-security-rules.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) |
| `m.check()` / `m.unsatCore` | 充足性チェックと矛盾制約サブセットの抽出 | [制約矛盾の診断](./unsat-core.md), [シフト作成](./shift-scheduling.md) | [`05-unsat-core-diagnosis.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts) |

## ローカル環境（Node.js）での実行方法

リポジトリをクローンして依存パッケージをインストールすると、すべてのサンプルを `npx tsx` で直接実行できます。

```bash
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/02-knapsack-problem.ts
npx tsx examples/node/03-portfolio-qp.ts
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/06-pulp-compatibility.ts
npx tsx examples/node/07-hybrid-smt-mip.ts
npx tsx examples/node/08-glpk-solver-plugin.ts
npx tsx examples/node/09-transportation-problem.ts
npx tsx examples/node/10-diet-sensitivity.ts
npx tsx examples/node/11-shift-scheduling.ts
npx tsx examples/node/12-ecommerce-coupon-optimizer.ts
```
