# 数理最適化ガイド・用語集

**数理最適化100本ノック** を進めるうえで必要な、問題の読み方・モデリングの基本用語・採点結果の見方をまとめたリファレンスです。

## 1. 採点の仕組み（`solve(input)`） {#solve-contract}

- どの問題も、入力を受け取って結果の JSON オブジェクト（Python なら `dict`）を返す関数 **`solve(input)`** を 1 つ実装します。
- **WaSHI** 自体は TypeScript / JavaScript ライブラリであり Python パッケージではありませんが、せっかくなので、Python ユーザーもブラウザ上でそのまま練習・比較できるよう、定番の **PuLP (Python)**（ソルバーは HiGHS）を Pyodide 上で動かせるようにしています。
- **「実行して採点」** を押すと、テストケースごとに `solve(input)` が呼ばれ、戻り値の制約充足と目的値が自動検証されます。
- **WaSHI (TypeScript)** と **PuLP (Python)** のどちらか一方を **AC** にすると解答済み（`✓`）になります。`console.log` や `print` の出力はデバッグ確認用として画面に表示されます。

## 2. モデルの基本構成要素 {#building-blocks}

| 用語 | 意味 | WaSHI (TS) | PuLP (Python) |
| --- | --- | --- | --- |
| **決定変数** (Decision Variable) | ソルバーが最適な値を決める未知数。 | `m.continuous(...)` / `m.integer(...)` / `m.binary(...)` | `pulp.LpVariable(..., cat=pulp.LpContinuous / LpInteger / LpBinary)` |
| **上下界** (Bounds) | 単一変数にかかる範囲制限（例：$x \ge 0$）。 | `{ lb: 0, ub: cap }` | `lowBound=0, upBound=cap` |
| **線形式** (Linear Expression) | 変数の定数倍の和＋定数（例：$2x + 3y$）。 | ``expr`2 * ${x} + 3 * ${y}` `` または `dot(...)` | `2 * x + 3 * y` または `pulp.lpSum(...)` |
| **制約** (Constraint) | 有効な解が必ず満たさなければならない等式・不等式（`<=`, `>=`, `==`）。 | ``m.constraint(expr`... <= ...`)`` | `prob += ... <= ...` |
| **目的関数** (Objective) | 最小化または最大化したいスカラー指標（利益・コストなど）。 | `m.objective(maximize(...))` / `minimize(...)` | `LpProblem(..., LpMaximize / LpMinimize)` ＋ `prob += ...` |

### 変数の種類 {#variable-types}

- **連続変数 (`continuous`)**: 範囲内の実数（`12.5` など）を自由にとれる変数。線形計画（**LP**）で用います。
- **整数変数 (`integer`)**: `0, 1, 2, ...` の整数しかとれない変数。個数・回数など分割できない量に使います（**MIP**）。
- **0-1 / バイナリ変数 (`binary`)**: `0`（選ばない・使わない）か `1`（選ぶ・稼働する）の 2 値のみをとる整数変数です。

## 3. 採点ステータスとソルバー用語 {#verdicts}

| 採点結果 | 意味 | よくある原因 |
| --- | --- | --- |
| **AC** | 正解（全テストケースで制約を満たし最適解と一致） | モデルと戻り値の両方が正しい状態です。 |
| **SUBOPTIMAL** | 実行可能だが最適ではない | `minimize` と `maximize` の逆転、目的係数の抜け、不要な強い制約など。 |
| **VIOLATION** | 問題の制約ルールに違反している | 制約の書き忘れ、`<=` と `>=` の向き逆転、小数を無理やり丸めたなど。 |
| **INFEASIBLE** | すべての制約を同時に満たす解が存在しない | 矛盾する制約（例：$x \ge 10$ かつ $x \le 5$）を入れている。 |
| **ERROR** | 実行時エラー、未求解、出力形式エラー | `await m.solve()` の書き忘れ、非有界（Unbounded）、戻り値キー名の不一致など。 |

### 解の状態に関する用語 {#solver-status}

- **最適解 (Optimal)**: 制約を満たす解のうち、目的関数が最良であると証明された解。
- **実行可能解 (Feasible Solution)**: 最適かどうかは別として、すべての制約条件と上下界を満たしている解。
- **実行不能 (Infeasible)**: 制約条件どうしが矛盾しており、条件をすべて満たす解が 1 つも存在しない状態。
- **非有界 (Unbounded)**: 目的値を無限に良くできてしまう状態（上限制約や変数の上界 `ub` の書き忘れでよく起きます）。
- **未求解 (NotSolved)**: `solve()` を呼ぶ前に変数の `.value` を読もうとした状態。

## 4. 代表的な問題クラス {#paradigms}

- **LP（線形計画法 / Linear Programming）**: 連続変数のみを使い、制約・目的関数がすべて 1 次式（線形）で表せる問題。実行可能領域（多面体）の頂点を辿って高速に厳密解が求まります。
- **MIP（混合整数計画法 / Mixed-Integer Programming）**: LP に整数変数や 0-1 変数を組み合わせた問題。個数制約・採択選択・固定費つき稼働（**Big-M**）などを表現できます。
- **CP / SMT**: スケジューリング・論理パズル・ルール矛盾の診断などに適した制約プログラミング／充足可能性モジュロ理論（後半の章で扱います）。

## 5. 関連リンク・参考リソース {#resources}

組合せ最適化を中心に、数理最適化・制約プログラミング（LP / MIP / CP / SMT）の問題理解と定式化に役立つ公式ドキュメントと参考資料を紹介します。

### 参考資料の使い分け

定式化の基本や実践的なテクニックを学ぶには、MO-book、MOSEK Modeling Cookbook、opt100 が参考になります。制約プログラミング（CP）には MiniZinc Handbook、論理制約や SMT には Online Z3 Guide が役立ちます。WaSHI での実装方法については WaSHI 公式ドキュメントを参照してください。

### モデリングライブラリ・ソルバー公式ドキュメント

- [WaSHI 公式ドキュメント](https://washi.ohtaman.dev/ja/) — WaSHI の API、各ソルバーバックエンド、定式化ガイド、実装例を掲載。
- [PuLP 公式ドキュメント](https://coin-or.github.io/pulp/) — `PuLP (Python)` タブで使用している Python 向け LP / MIP モデリングライブラリのリファレンス。
- [HiGHS](https://highs.dev/)（[Docs](https://ergo-code.github.io/HiGHS/dev/)） — WaSHI の標準 LP / MIP / QP ソルバー。PuLP からも利用できる高性能なオープンソースソルバー。
- [Google OR-Tools](https://developers.google.com/optimization) — MIP・配送計画・スケジューリング・CP-SAT など、実例が豊富な公式ガイド。
- [The MiniZinc Handbook](https://docs.minizinc.dev/en/stable/) — 制約プログラミング（CP）のモデリング手法やグローバル制約を体系的に解説。
- [JuMP ドキュメント](https://jump.dev/JuMP.jl/stable/) — Julia 向けの数理最適化モデリングライブラリ。LP / MIP をはじめとする定式化パターンや実装例を掲載。
- [Pumpkin (ConSol-Lab)](https://github.com/ConSol-Lab/Pumpkin) — WaSHI の CP バックエンドに使用されている Lazy Clause Generation（LCG）型の制約プログラミングソルバー。
- [Online Z3 Guide](https://microsoft.github.io/z3guide/) — SMT ソルバー Z3 をブラウザ上で試しながら、論理制約や充足可能性判定を学べる公式ガイド。

### 組合せ最適化の解説・問題リファレンス

- [MOSEK Modeling Cookbook](https://docs.mosek.com/modeling-cookbook/index.html) — Big-M、指示制約、論理条件の線形化など、実践的なモデリングの定石集。特に Mixed Integer Optimization 章が有用。
- [Hands-On Mathematical Optimization with Python（MO-book）](https://mobook.github.io/MO-book/) — LP / MIP、ネットワーク最適化などの数理最適化を、Jupyter Notebook による実装例とともに学べるオープン教材。
- [CSPLib](https://www.csplib.org/) — 制約プログラミングや組合せ最適化の標準的なベンチマーク問題を収録したライブラリ。
- [Python言語による実務で使える100+の最適化問題（SCMOPT opt100）](https://scmopt.github.io/opt100/) — グラフ・割当・施設配置・物流・スケジューリングなど、100を超える最適化問題の定式化や解法を紹介。関連書籍『Pythonによる実務で役立つ最適化問題100+』のサポート情報も掲載。
