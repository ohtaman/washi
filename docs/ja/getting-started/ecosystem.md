# エコシステム比較と Python (PuLP) からの移行ガイド

`@ohtaman/washi` は、組み込みの HiGHS WebAssembly とオプションの Z3・GLPK アダプターを備えた高水準な代数モデリング層であり、Python の PuLP のようなモデリングライブラリと JavaScript / WebAssembly の低レベルなソルバーバインディングとの橋渡しをします。

---

## 🧭 JavaScript / TypeScript 最適化エコシステムの整理

TypeScript / JavaScript 環境で線形計画法（LP）、混合整数線形計画法（MIP / MILP）、凸二次計画法（QP）、または SMT（充足可能性モジュロ理論）を解く場合、大きく分けて次の 3 つのアプローチがあります。

### 1. 代数モデラー + マルチソルバーランタイム（`@ohtaman/washi`）

- **提供機能**: 型安全な代数モデリング API（`Model`, `Var`, `LinExpr`, `QuadExpr`, `BoolExpr`, `expr`, `sum`, `dot`, `m.indicator`, `m.validateSolution`, `solveColumnGeneration`, `solveBenders`）と、標準搭載の **HiGHS** WebAssembly ランタイム（MIT）、およびオプションの **Z3**（MIT）・**GLPK**（GPL-3.0）プラグインを提供します。
- **特徴**: LP 文字列や係数行列、JSON 配列を手組みする代わりに、`Record<K, Var>` や `Var[]` に対して TypeScript の型チェックが効く宣言的な数式でモデルを記述できます。ブラウザでは標準で専用 Web Worker 上で実行され（`onProgress` や `AbortSignal` に対応）、LP 形式での確認（`m.toLpString()`）、解の独立検証（`m.validateSolution()`）、実行不能時の原因診断（`await m.check()`）まで一貫して扱えます。
- **適した用途**: シフト作成、大学時間割編成、リソース配分、2次元パッキング、配送計画、ポートフォリオ QP、制約矛盾診断を組み込んだアプリケーション。

### 2. 生の WebAssembly ソルバーバインディング（`highs` / `highs-js`, `glpk.js`, `z3-solver`）

これらは強力な C/C++ 製ソルバーエンジンを WebAssembly へコンパイルし、JavaScript / TypeScript から直接呼び出すための低レベルなバインディングです。

- **[`highs`](https://github.com/lovasoa/highs-js)**（*MIT*）: CPLEX LP / MPS 形式のテキストや行列入力を受け取り（`highs.solve(lpText)`）、求解結果を返す直接的なラッパーです。すでに LP/MPS 文字列を自前で生成している場合や、抽象化レイヤーを最小限に抑えたい場合に適しています。
- **[`glpk.js`](https://github.com/jvail/glpk.js)**（*GPL-3.0*）: GLPK を JSON スキーマ（`objective`, `subjectTo`, `bounds`）で呼び出すラッパーです。GPL-3.0 条件のもとで GLPK 固有の API を直接利用したい場合に適しています。
- **[`z3-solver`](https://www.npmjs.com/package/z3-solver)**（*MIT*）: Z3 公式の WebAssembly バインディングであり、AST や SMT コンテキスト（`Context`, `Solver`, `Optimize`, ビットベクタ、量化子、未解釈関数など）をフルに公開しています。命題論理・線形算術を超えた低レベルな SMT 理論が必要な場合に適しています。

> [!NOTE]
> **WaSHI と各バインディングの関係**: **HiGHS** について、WaSHI は上流の [`ERGO-Code/HiGHS`](https://github.com/ERGO-Code/HiGHS) C++ ソースを直接 WebAssembly にコンパイルし、C API 経由で実行時依存なしに統合しています。**GLPK** と **Z3** については、`glpk.js` と `z3-solver` をオプションのピア依存プラグインとして統合し、共通の `Model` インターフェースから利用できるようにしています。これにより、`expr` で一度記述したモデルを HiGHS（`m.solve()`）で数値最適化し、Z3（`m.check({ solver: "z3" })`）で矛盾診断するといった併用が可能です。生の LP 文字列をそのまま渡したい場合や Z3 の高度な SMT 理論を直接組みたい場合は、これら上流パッケージの直接利用が適しています。

### 3. 純 JavaScript ソルバー（`yalps`, `javascript-lp-solver`）

- **[`yalps`](https://github.com/IanManske/yalps)**（*MIT*）および **[`javascript-lp-solver`](https://github.com/JWally/jsLPSolver)**（*Unlicense*）: WebAssembly バイナリ（`.wasm`）を含まず、軽量なバンドルサイズで動作する純 JS/TS 実装の単体法・分枝限定法ソルバーです。
- **強み**: `.wasm` アセットの配信を避けたい場合や、小〜中規模の LP/MIP を最小のフットプリントで解きたい場合に非常に有効です。
- **WebAssembly / WaSHI が有利になる場面**: 規模が大きい、または制約が密に絡む MILP（勤務シフト最適化、時間割編成、2次元パッキング等）では、WebAssembly 化された HiGHS の C++ 前処理（Presolve）、切除平面（Cutting Planes）、発見的解法による高速化が大きく効きます。また純 JS の LP/MIP ソルバーは凸 QP や SMT の `unsatCore` 矛盾診断は対象外です。

### 比較一覧

| パッケージ | ランタイム / エンジン | ライセンス | モデリング形式 | 対応問題クラス | 主な適性 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`@ohtaman/washi`** | 内蔵 HiGHS WASM + オプション Z3 / GLPK | **MIT** *（GLPK プラグインは GPL-3.0）* | 代数式（`expr`, `sum`, `dot`, 型付き `Var` コンテナ, `indicator`） | LP, MIP / MILP, 凸QP, SMT（`BoolVar`, `unsatCore`） | TS/JS 本格最適化、スケジューリング、QP、矛盾診断 |
| **`highs` (`highs-js`)** | HiGHS WASM | **MIT** | CPLEX LP / MPS 文字列・行列入力 | LP, MIP, 凸QP | 生成済み LP/MPS モデルの直接求解 |
| **`glpk.js`** | GLPK WASM | **GPL-3.0** | JSON スキーマ（`objective`, `subjectTo`, bounds） | LP, MIP | GPL-3.0 互換環境での GLPK 直接利用 |
| **`z3-solver`** | Z3 WASM（`SharedArrayBuffer` スレッド） | **MIT** | 低レベル Z3 AST・SMT `Context` API | SMT, SAT, 形式検証, `Optimize` | ビットベクタ・量化子など独自 SMT 理論の記述 |
| **`yalps`** | 純 TypeScript / JS | **MIT** | オブジェクト / Map ベース LP/MIP スキーマ | LP, MIP | `.wasm` なしの小〜中規模 LP/MIP |
| **`javascript-lp-solver`** | 純 JavaScript | **Unlicense** | JSON モデルオブジェクト | LP, MIP | `.wasm` なしの簡易 LP/MIP |

---

## 🐍 Python (`PuLP`) から WaSHI への移行

Python の **[PuLP](https://github.com/coin-or/pulp)** に慣れている方にとって、WaSHI のモデリング手順は PuLP と非常に近い構造を持ちつつ、TypeScript の型安全性、ブラウザでの WebAssembly 実行、凸 QP、および SMT 矛盾診断が加わります。

### 対照コード例：生産計画 MILP

::: code-group

```typescript [TypeScript (WaSHI)]
import { Model, expr, maximize } from "@ohtaman/washi";

const products = ["desk", "chair"] as const;
const profit = { desk: 30, chair: 50 };
const wood = { desk: 1, chair: 2 };
const labor = { desk: 2, chair: 1 };

const m = new Model("Production");
const qty = m.integer(products, { lb: 0, ub: 100 });

m.objective(maximize(expr`dot(${profit}, ${qty})`));
m.constraint(expr`dot(${wood}, ${qty}) <= 40`, "wood_limit");
m.constraint(expr`dot(${labor}, ${qty}) <= 50`, "labor_limit");

const status = await m.solve();
const report = m.validateSolution();
console.log(status, report.valid, m.objectiveValue, m.getValues(qty));
// "Optimal", true, 1100, { desk: 20, chair: 10 }
```

```python [Python (PuLP)]
from pulp import LpProblem, LpMaximize, LpVariable, lpSum, LpStatus, value

products = ["desk", "chair"]
profit = {"desk": 30, "chair": 50}
wood = {"desk": 1, "chair": 2}
labor = {"desk": 2, "chair": 1}

prob = LpProblem("Production", LpMaximize)
qty = LpVariable.dicts("qty", products, lowBound=0, upBound=100, cat="Integer")

prob += lpSum(profit[p] * qty[p] for p in products)
prob += lpSum(wood[p] * qty[p] for p in products) <= 40, "wood_limit"
prob += lpSum(labor[p] * qty[p] for p in products) <= 50, "labor_limit"

prob.solve()
print(LpStatus[prob.status], value(prob.objective), {p: value(qty[p]) for p in products})
# Optimal 1100.0 {'desk': 20.0, 'chair': 10.0}
```

:::

### 概念・API 対照表

| 概念 | Python (`PuLP`) | TypeScript / JavaScript (`@ohtaman/washi`) |
| :--- | :--- | :--- |
| **モデル生成** | `prob = LpProblem("Name", LpMaximize)` | `const m = new Model("Name")` + `m.objective(maximize(...))` |
| **スカラー変数** | `LpVariable("x", lowBound=0, upBound=10, cat="Integer")` | `m.integer("x", { lb: 0, ub: 10 })`（`continuous`, `integer`, `binary`, `bool`） |
| **添字付き変数** | `LpVariable.dicts("x", keys, lowBound=0)` | `m.integer(keys, { lb: 0 })` → 型付き `Record<K, Var>`（数値指定で `Var[]` / `Var[][]`） |
| **総和・内積** | `lpSum(c[k] * x[k] for k in keys)` | `` expr`dot(${c}, ${x})` `` または `sum(keys, (k) => expr\`...\`)` |
| **制約追加** | `prob += expr <= 40, "limit"` | `m.constraint(expr\`... <= 40\`, "limit")` |
| **条件付き制約 (Big-M)** | 手動で Big-M 不等式を記述 | `m.indicator(binVar, constraint, { activeValue: 0 })`（`lb`/`ub` から最小限の Big-M を自動導出） |
| **求解** | `prob.solve()`（CBC 等を呼び出し） | `await m.solve()`（標準搭載 HiGHS WASM。`{ solver: "glpk" }` / `{ solver: "z3" }` も可） |
| **LP 出力確認** | `prob.writeLP("model.lp")` | `m.toLpString()` |
| **結果の取得** | `LpStatus[prob.status]`, `value(x)`, `value(prob.objective)` | `status`, `x.value`, `m.getValues(qty)`, `m.objectiveValue`, `c.dual`, `c.slack` |
| **検証と矛盾診断** | 手動検証 | `m.validateSolution()` および `await m.check()`（`conflicts` / Z3 `unsatCore`） |

### TypeScript / ブラウザ環境ならではの拡張機能

- **Node.js からブラウザまで同一コード**: Python サーバーを立てることなく、Node.js API・CLI でもブラウザの Web Worker 上でも同じモデリングコードが動作します。
- **凸二次計画 (QP / `QuadExpr`)**: 連続変数モデル上で `` expr`sum((${x} - ${target})^2)` `` のような二次目的関数を HiGHS でそのまま解けます。
- **論理制約と矛盾特定 (`m.check()`)**: `implies`・`and`・`or`・`xor`・`not` を直接記述でき、実行不能時には HiGHS の弾性修復集合または Z3 の `unsatCore` で矛盾した制約を特定できます。
- **大規模問題の分解法ヘルパー**: 列生成法（`solveColumnGeneration`）および Benders 分解（`solveBenders`）のオーケストレーターを標準搭載しています。

---

## 🧭 次のステップ

- **[インストールと入門](./index.md)**: `@ohtaman/washi` の導入と最初のモデル実行
- **[ソルバー概要と比較](../solvers/index.md)**: HiGHS・Z3・GLPK・カスタムソルバーの比較
- **[変数と境界値](../guide/variables.md)**: 型付き `Record`・配列変数コンテナの使い方
- **[実践例と API 早見表](../examples/index.md)**: LP・MILP・QP・SMT の 11 個の実践レシピ
- **[AI エージェント向けクイックリファレンス](./ai-agents.md)**: AI コーディングエージェント向けのコンパクトリファレンスと `SKILL.md`
