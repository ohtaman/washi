# 実践レシピ集・機能別インデックス

WaSHI を使った数理最適化・論理検証のサンプル集です。すべてのレシピは、[インタラクティブ Web デモ](https://ohtaman.github.io/washi/demo/) でブラウザ上から即座に実行・編集できるほか、[`examples/node/`](https://github.com/ohtaman/washi/tree/main/examples/node) にある単体スクリプトとしてローカル実行できます。

---

## 1. 基本モデル（ライブラリと API の理解）

30〜50行程度のシンプルなコードで、WaSHI の中核機能を1つずつ段階的に学べる入門サンプルです。

| レシピ | 問題クラス | 学べる主な API | 内容・ポイント | デモで試す |
| :--- | :--- | :--- | :--- | :--- |
| **[生産計画問題](./production.md)** | LP / MIP | `addVar()`, `expr`, `c` | 変数の定義、テンプレートリテラルによる数式記述、リソース上限下での利益最大化。 | [▶ デモ](https://ohtaman.github.io/washi/demo/?preset=production) |
| **[0-1 ナップサック問題](./knapsack.md)** | 0-1 MIP | `addVars(keys)`, `sum()` | 1次元キー配列からの `Binary` 変数生成と、`sum()` による配列集計。 | [▶ デモ](https://ohtaman.github.io/washi/demo/?preset=knapsack) |
| **[輸送・物流ネットワーク](./transportation.md)** | LP | `addVars(rows, cols)`, `sum()` | `ship[factory][store]` のような2次元マトリクス変数の生成と、行・列方向のフロー保存則。 | [▶ デモ](https://ohtaman.github.io/washi/demo/?preset=transportation) |
| **[栄養問題と感度分析](./diet-sensitivity.md)** | LP | `constr.dual`, `constr.slack`, `var.reducedCost` | 求解後に潜在価格（ボトルネックの特定）、余剰（スラック）、被約費用を取り出す方法。 | [▶ デモ](https://ohtaman.github.io/washi/demo/?preset=diet_sensitivity) |

---

## 2. 実践ユースケース（業務・アプリへの応用）

Web アプリケーション、シフト管理 SaaS、EC 決済画面、金融ポートフォリオ分析など、実務での使い方のイメージを掴める実践モデルです。

| レシピ | 問題クラス | ソルバー | 内容・アピールポイント | デモで試す |
| :--- | :--- | :--- | :--- | :--- |
| **[スタッフのシフト作成と競合診断](./shift-scheduling.md)** | 0-1 MIP + Unsat Core | HiGHS + Z3 | 日別必要人数・リーダー配置・連勤上限・希望休を満たすシフト作成と、希望休が衝突した際の Z3 `unsatCore` による原因特定。 | [▶ デモ](https://ohtaman.github.io/washi/demo/?preset=shift_scheduling) |
| **[ECカートのクーポン最適適用](./ecommerce-coupons.md)** | Indicator MIP | HiGHS | `addIndicator()` を用いた最低購入金額条件、併用不可ルール、さらに「あと少し買い足すと上位割引が解放されて得になる」提案の自動計算。 | [▶ デモ](https://ohtaman.github.io/washi/demo/?preset=cart_coupon) |
| **[ポートフォリオ最適化](./portfolio-qp.md)** | 凸二次計画 (QP) | HiGHS | `QuadExpr` を用いたマーコウィッツの平均・分散モデル（共分散リスクの最小化）。 | [▶ デモ](https://ohtaman.github.io/washi/demo/?preset=portfolio_qp) |

---

## 3. 論理検証・競合診断（Z3 SMT / Unsat Core）

目的関数を持たない論理ルールの充足性判定（`m.check()`）や、ルール同士が矛盾した際の原因特定（`unsatCore`）を行うサンプルです。

| レシピ | 問題クラス | ソルバー | 内容・ポイント | デモで試す |
| :--- | :--- | :--- | :--- | :--- |
| **[セキュリティポリシー検証](./smt-security.md)** | SMT 論理 | Z3 | 命題変数（`BoolVar`）と論理演算（`implies`, `and`, `not`, `xor`）によるルール検証。 | [▶ デモ](https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling) |
| **[制約矛盾の診断 (`unsatCore`)](./unsat-core.md)** | Unsat Core | Z3 | 人員要件と予算上限が衝突した際、矛盾を引き起こしている制約の部分集合を自動抽出。 | [▶ デモ](https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat) |

---

## 🔍 WaSHI API・機能からの逆引きインデックス

「この API の書き方を知りたい」という場合の逆引き表です。

| 機能 / API | 用途 | おすすめレシピ | Node.js ソースコード |
| :--- | :--- | :--- | :--- |
| ``expr`...` `` / ``c`...` `` | テンプレートリテラルによる数式・制約記述 | [生産計画問題](./production.md) | [`01-production-planning.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/01-production-planning.ts) |
| `m.addVars(keys)` | 1次元キー辞書による変数の一括生成 | [0-1 ナップサック問題](./knapsack.md) | [`02-knapsack-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/02-knapsack-problem.ts) |
| `m.addVars(rows, cols)` | 2次元マトリクス変数の一括生成 | [輸送・物流ネットワーク](./transportation.md), [シフト作成](./shift-scheduling.md) | [`09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts) |
| `constr.dual` / `constr.slack` | 潜在価格（Shadow Price）と余剰（Slack）の取得 | [栄養問題と感度分析](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `var.reducedCost` | 変数の被約費用（Reduced Cost）の取得 | [栄養問題と感度分析](./diet-sensitivity.md) | [`10-diet-sensitivity.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/10-diet-sensitivity.ts) |
| `m.addIndicator()` | 条件付き制約（Big-M 自動線形化） | [ECカートのクーポン最適適用](./ecommerce-coupons.md) | [`12-ecommerce-coupon-optimizer.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) |
| `new QuadExpr()` | 凸二次目的関数（$x^T Q x$） | [ポートフォリオ最適化](./portfolio-qp.md) | [`03-portfolio-qp.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/03-portfolio-qp.ts) |
| `m.addBoolVar()` / `.implies()` | 命題論理・含意制約（SMT） | [セキュリティポリシー検証](./smt-security.md) | [`04-smt-security-rules.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) |
| `m.check()` / `m.unsatCore` | 充足性チェックと矛盾制約サブセットの抽出 | [制約矛盾の診断](./unsat-core.md), [シフト作成](./shift-scheduling.md) | [`05-unsat-core-diagnosis.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts) |

---

## ローカル環境（Node.js）での実行方法

リポジトリをクローンして依存パッケージをインストールすると、すべてのサンプルを `npx tsx` で直接実行できます。

```bash
# 1. 基本モデル
npx tsx examples/node/01-production-planning.ts
npx tsx examples/node/02-knapsack-problem.ts
npx tsx examples/node/09-transportation-problem.ts
npx tsx examples/node/10-diet-sensitivity.ts

# 2. 実践ユースケース
npx tsx examples/node/11-shift-scheduling.ts
npx tsx examples/node/12-ecommerce-coupon-optimizer.ts
npx tsx examples/node/03-portfolio-qp.ts

# 3. 論理検証・競合診断・プラグイン
npx tsx examples/node/04-smt-security-rules.ts
npx tsx examples/node/05-unsat-core-diagnosis.ts
npx tsx examples/node/06-pulp-compatibility.ts
npx tsx examples/node/07-hybrid-smt-mip.ts
npx tsx examples/node/08-glpk-solver-plugin.ts
```
