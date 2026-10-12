# Python (PuLP & Gurobi) からの移行ガイド

Python の数理最適化ライブラリ（PuLP や Gurobi / gurobipy）から移行するエンジニアやデータサイエンティスト向けに、WaSHI の設計思想と構文の対応関係を解説します。

WaSHI は Python 固有の仕様回避（`0 + ...` を避けるための特殊な `lpSum` など）や不要なラッパークラスを引き継ぐのではなく、**数学的な本質に忠実な代数モデラー**として再構築されています。
変数は「定義域（Domain）」、制約は「課す（constrain）」、目的関数は「方向（maximize / minimize）」として直感的に記述できます。

---

## コード比較

::: code-group

```python [Python (PuLP)]
import pulp

prob = pulp.LpProblem("Production", pulp.LpMaximize)

# 変数定義
x = pulp.LpVariable("desks", lowBound=0, cat="Integer")
y = pulp.LpVariable("chairs", lowBound=0, cat="Integer")

# 目的関数
prob += 30 * x + 50 * y, "Total_Profit"

# 制約条件
prob += x + 2 * y <= 40, "Wood_Constraint"
prob += 2 * x + y <= 50, "Labor_Constraint"

# 最適化と解の取得
prob.solve()
print(f"Status: {pulp.LpStatus[prob.status]}")
print(f"Profit: {pulp.value(prob.objective)}")
print(f"x: {pulp.value(x)}, y: {pulp.value(y)}")
```

```python [Python (Gurobi)]
import gurobipy as gp
from gurobipy import GRB

m = gp.Model("Production")

# 変数定義
x = m.addVar(name="desks", lb=0, vtype=GRB.INTEGER)
y = m.addVar(name="chairs", lb=0, vtype=GRB.INTEGER)

# 目的関数
m.setObjective(30 * x + 50 * y, GRB.MAXIMIZE)

# 制約条件
m.addConstr(x + 2 * y <= 40, "Wood_Constraint")
m.addConstr(2 * x + y <= 50, "Labor_Constraint")

# 最適化と解の取得
m.optimize()
print(f"Status: {m.Status}")
print(f"Profit: {m.ObjVal}")
print(f"x: {x.X}, y: {y.X}")
```

```typescript [TypeScript (WaSHI)]
import { Model, expr } from "@ohtaman/washi";

const m = new Model("Production");

// 変数定義: ドメイン名による直交的な生成
const x = m.integer("desks", { lb: 0 });
const y = m.integer("chairs", { lb: 0 });

// 目的関数: 数学的な方向（動詞）
m.maximize(expr`30 * ${x} + 50 * ${y}`);

// 制約条件: 第1推奨の constrain() メソッド
m.constrain(expr`${x} + 2 * ${y} <= 40`, "Wood_Constraint")
 .constrain(expr`2 * ${x} + ${y} <= 50`, "Labor_Constraint");

// 最適化と解の取得
await m.optimize();
console.log(`Status: ${m.status}`);
console.log(`Profit: ${m.objectiveValue}`);
console.log(`Values:`, m.getValues([x, y]));
```

:::

---

## 🧭 機能・構文の対応表

| 概念 | Python (PuLP) | Python (Gurobi) | WaSHI (TypeScript) |
| :--- | :--- | :--- | :--- |
| **モデル生成** | `prob = LpProblem(...)` | `m = gp.Model(...)` | `const m = new Model(...)` |
| **バイナリ変数** | `LpVariable(..., cat="Binary")` | `m.addVar(vtype=GRB.BINARY)` | `m.binary("x")` または `m.binary(items)` |
| **整数変数** | `LpVariable(..., cat="Integer")` | `m.addVar(vtype=GRB.INTEGER)` | `m.integer("x", { lb, ub })` |
| **連続変数** | `LpVariable(..., cat="Continuous")` | `m.addVar(vtype=GRB.CONTINUOUS)` | `m.continuous("x", { lb, ub })` |
| **多次元変数** | 内包表記辞書 | `m.addVars(I, J)` | `m.binary(I, J)` または `m.continuous(I, J)` |
| **目的関数** | `prob += expr` | `m.setObjective(expr, GRB.MAXIMIZE)` | `m.maximize(expr)` または `m.minimize(expr)` |
| **制約追加** | `prob += expr <= b` | `m.addConstr(expr <= b)` | `m.constrain(expr\`... <= ...\`)` |
| **総和集計** | `lpSum(...)` | `quicksum(...)` | `sum(...)` |
| **内積集計** | `lpSum(c[i] * x[i] for i in I)` | `x.prod(c)` | `dot(c, x)` |
| **最適化実行** | `prob.solve()` | `m.optimize()` | `await m.optimize()` |
| **解の値取得** | `pulp.value(x)` | `x.X` | `x.value` または `m.getValues(x)` |
| **双対変数 (シャドウプライス)** | `c.pi` | `c.Pi` | `c.dual` |
| **スラック** | `c.slack` | `c.Slack` | `c.slack` |
| **被約費用** | `x.dj` | `x.RC` | `x.reducedCost` |

---

## WaSHI の主要な設計方針

1. **変数は定義域（Domain）そのもの**: `type: "binary"` のような文字列タグによる分岐はありません。`m.binary()`、`m.integer()`、`m.continuous()` により、数学的定義域に応じた正確な型推論とバリデーションが行われます。
2. **テンプレートリテラルによる数式表現**: `expr\`${x} + 2 * ${y} <= 40\`` により、型安全で可読性の高い数式を直感的に記述できます。
3. **純粋な線形代数演算 (`sum`, `dot`)**: コストと数量の内積は `dot(costs, x)` と書くだけで、1次元オブジェクトだけでなく多次元グリッドの集計も自然に行われます。
