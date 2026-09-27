# HiGHS Web Modeler ⚡

Edinburgh大学が開発した世界最高峰のオープンソース数理最適化ソルバー **[HiGHS](https://github.com/ERGO-Code/HiGHS)** を **WebAssembly (WASM)** でブラウザおよびNode.js上で高速動作させ、Python の **PuLP** や **python-mip** のような直感的な記法で数理モデル（LP / MIP / QP）を記述・求解できるモダンな数理最適化ライブラリ＆Webプレイグラウンドです。

---

## 🌟 主な特徴

- 🚀 **HiGHS WebAssembly (WASM) 搭載**:
  - C++ ネイティブの HiGHS (v1.15.3) を WebAssembly にコンパイル。
  - サーバーレス・クライアントサイド完結。ブラウザ内や Node.js で高速に求解。
- 🔌 **PuLP 思想のソルバー切り替え（非依存性）**:
  - 特定ソルバーに密結合せず、`prob.solve(new HiGHS())`、外部サーバー連携 `new RemoteSolver({ url })`、CI 用 `new MockSolver()`、独自最適化エンジンを共通インターフェースで自在に切り替え可能。
- ⚡ **20,000 変数の大規模問題に対応**:
  - サプライチェーン施設配置・全国配送問題（決定変数 20,050 個、制約 451 本）を約 15 秒で厳密最適解まで導出。数式合成は $O(N)$ 線形時間でミリ秒処理。
- 💡 **PuLP / python-mip ライクな直感的モデラー API**:
  - Python で親しまれている数理最適化モデラーの使い心地を JavaScript / TypeScript に完全再現。
  - フルーエント・オブジェクト式 (`x.mul(30).add(y.mul(50))`)
  - `sum()` / `xsum()` / `lpSum()` による直感的な総和表記
  - 文字列数式やタグ付きテンプレート DSL (`expr\`\${x} + 2 * \${y} <= 40\``)
  - 2次元・多次元変数の簡単生成 (`addVars2D(rows, cols, { type: "Binary" })`)
- 🧵 **Web Worker による非ブロッキング非同期実行**:
  - 大規模な MIP 問題もバックグラウンドの Web Worker で求解するため、ブラウザ UI が固まりません。
- 🔄 **互換レイヤー完備**:
  - **PuLP 互換**: `LpProblem`, `LpVariable`, `lpSum`, `LpMaximize`, `value()` 等
  - **python-mip 互換**: `MipModel`, `xsum`, `maximize()`, `INTEGER`, `var.x` 等
- 📜 **標準 CPLEX LP フォーマット生成**:
  - `model.toLpString()` で CPLEX LP 形式を出力・確認・ダウンロード可能。
- 🎨 **和風ライトテーマの Web プレイグラウンド付属**:
  - ナーススケジューリング（10人×7日間シフト表）、サプライチェーン最適化、0-1ナップサック、N-Queens問題等の実務サンプルを即座に実行・可視化。

---

## 📦 インストール

```bash
npm install highs
# またはこのリポジトリのモデラーを使用
```

---

## 🚀 クイックスタート

### 1. モダン・直感的スタイル (Fluent & `sum`)

```typescript
import { Model, INTEGER, sum } from "./src/modeler/index.js";

// 1. モデル作成 (最大化問題)
const m = new Model({ name: "ProductionPlanning", sense: "Maximize" });

// 2. 変数定義 (下限 0 の整数変数)
const chairs = m.addVar({ name: "chairs", type: "Integer", lb: 0 });
const tables = m.addVar({ name: "tables", type: "Integer", lb: 0 });

// 3. 目的関数: 利益の最大化 ($30/chair, $50/table)
m.maximize(chairs.mul(30).add(tables.mul(50)));

// 4. 制約条件の追加
// 木工工数: 1*chairs + 2*tables <= 40
m.addConstraint(chairs.add(tables.mul(2)).le(40), "carpentry");

// 仕上げ工数: 2*chairs + 1*tables <= 50
m.addConstraint(chairs.mul(2).add(tables).le(50), "finishing");

// 5. HiGHS WASM で求解
const status = await m.optimize();

console.log("Status:", status);                // "Optimal"
console.log("Profit: $" + m.objectiveValue);    // 1100
console.log("Chairs:", chairs.value);          // 20
console.log("Tables:", tables.value);          // 10
```

---

### 2. Python PuLP 互換スタイル

PuLP を使っていた方なら、そのまま馴染みのある構文で記述できます：

```typescript
import {
  LpProblem,
  LpVariable,
  LpMaximize,
  LpInteger,
  value
} from "./src/modeler/index.js";

const prob = new LpProblem("Production", LpMaximize);

const x = new LpVariable("chairs", 0, undefined, LpInteger);
const y = new LpVariable("tables", 0, undefined, LpInteger);

// 目的関数
prob.setObjective(x.mul(30).add(y.mul(50)));

// 制約
prob.addConstraint(x.add(y.mul(2)).le(40));
prob.addConstraint(x.mul(2).add(y).le(50));

await prob.solve();

console.log("Status:", prob.status);         // Optimal
console.log("Objective:", value(prob.objective)); // 1100
console.log("chairs:", value(x));            // 20
console.log("tables:", value(y));            // 10
```

---

### 3. python-mip 互換スタイル

python-mip スタイルの記法もサポートしています：

```typescript
import {
  MipModel,
  MAXIMIZE,
  INTEGER,
  maximize
} from "./src/modeler/index.js";

const m = new MipModel("Production", MAXIMIZE);

const x = m.add_var({ name: "chairs", var_type: INTEGER, lb: 0 });
const y = m.add_var({ name: "tables", var_type: INTEGER, lb: 0 });

// 目的関数
m.objective_spec = maximize(x.mul(30).add(y.mul(50)));

// 制約
m.add_constr(x.add(y.mul(2)).le(40));
m.add_constr(x.mul(2).add(y).le(50));

await m.optimize();

console.log("Objective:", m.objective_value); // 1100
console.log("x (chairs):", x.x);             // 20
console.log("y (tables):", y.x);             // 10
```

---

### 4. 文字列 / タグ付きテンプレート DSL スタイル

数式をそのまま文字列やタグ付きテンプレートリテラルで直感的に記述できます：

```typescript
import { Model, expr } from "./src/modeler/index.js";

const m = new Model({ sense: "Maximize" });
const chairs = m.addVar("chairs", "Integer", 0);
const tables = m.addVar("tables", "Integer", 0);

// タグ付きテンプレートリテラルで直接変数をバインド
m.maximize(expr\`30 * \${chairs} + 50 * \${tables}\`);
m.addConstraint(expr\`\${chairs} + 2 * \${tables} <= 40\`, "carpentry");

// または変数名文字列でそのまま記述
m.addConstraint("2 * chairs + tables <= 50", "finishing");

await m.optimize();
console.log("Optimal:", m.objectiveValue); // 1100
```

---

## 🎒 ナップサック問題の例 (`sum` / `xsum`)

```typescript
const m = new Model({ name: "Knapsack", sense: "Maximize" });

const items = [
  { name: "Laptop", weight: 3, value: 50 },
  { name: "Camera", weight: 2, value: 40 },
  { name: "Book",   weight: 1, value: 10 },
  { name: "Water",  weight: 2, value: 25 },
];
const capacity = 5;

// 0-1 バイナリ変数
const x = m.addVars(items.map(it => it.name), { type: "Binary" });

// 目的関数: 合計価値の最大化
m.maximize(sum(items, it => x[it.name].mul(it.value)));

// 重量制限制約
m.addConstraint(
  sum(items, it => x[it.name].mul(it.weight)).le(capacity),
  "capacity_limit"
);

await m.optimize();
console.log("Max Value:", m.objectiveValue); // 90 (Laptop + Camera)
```

---

## 💻 Web プレイグラウンドの起動

ブラウザでコードをリアルタイムに書きながら、WASM の求解速度や結果の可視化を体験できる Web UI が付属しています。

```bash
# 開発サーバー起動
npm run dev

# ブラウザで開く
# http://127.0.0.1:5173/
```

- **プリセット**: 生産計画 (MIP)、0-1ナップサック、8-Queens (MIP)、食事問題 (LP)、PuLP構文、python-mip構文、テンプレートDSL
- **可視化**: 8-Queens のチェス盤描画、ナップサックのパッキングバッジ、最適変数テーブル、CPLEX LP形式ビューア、ソルバーログ
- **ショートカット**: `Ctrl + Enter` (または `Cmd + Enter`) で即時実行

---

## 🧪 テストの実行

```bash
npm test
```

Vitest による全テストスイート（MIP, LP, PuLP互換, python-mip互換, DSL, WASMバイナリ検証）が自動実行されます。
