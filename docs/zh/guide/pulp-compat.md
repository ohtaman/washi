# Python (PuLP & Gurobi) 迁移指南

针对从 Python（PuLP 或 Gurobi / gurobipy）转向 TypeScript/JavaScript 的工程师与数据科学家，本页介绍 WaSHI 的设计哲学与语法映射。

WaSHI 没有照搬 Python 的历史遗留设计（例如为避免 `0 + ...` 而创建的特殊 `lpSum` 或繁琐的封装类），而是构建了**贴合数学本质的代数建模器**：变量即定义域（Domain），约束即断言（constrain），目标即优化方向（maximize / minimize）。

---

## 代码对比

::: code-group

```python [Python (PuLP)]
import pulp

prob = pulp.LpProblem("Production", pulp.LpMaximize)

# 变量
x = pulp.LpVariable("desks", lowBound=0, cat="Integer")
y = pulp.LpVariable("chairs", lowBound=0, cat="Integer")

# 目标
prob += 30 * x + 50 * y, "Total_Profit"

# 约束
prob += x + 2 * y <= 40, "Wood_Constraint"
prob += 2 * x + y <= 50, "Labor_Constraint"

# 求解与提取
prob.solve()
print(f"Status: {pulp.LpStatus[prob.status]}")
print(f"Profit: {pulp.value(prob.objective)}")
print(f"x: {pulp.value(x)}, y: {pulp.value(y)}")
```

```python [Python (Gurobi)]
import gurobipy as gp
from gurobipy import GRB

m = gp.Model("Production")

# 变量
x = m.addVar(name="desks", lb=0, vtype=GRB.INTEGER)
y = m.addVar(name="chairs", lb=0, vtype=GRB.INTEGER)

# 目标
m.setObjective(30 * x + 50 * y, GRB.MAXIMIZE)

# 约束
m.addConstr(x + 2 * y <= 40, "Wood_Constraint")
m.addConstr(2 * x + y <= 50, "Labor_Constraint")

# 求解与提取
m.optimize()
print(f"Status: {m.Status}")
print(f"Profit: {m.ObjVal}")
print(f"x: {x.X}, y: {y.X}")
```

```typescript [TypeScript (WaSHI)]
import { Model, expr } from "@ohtaman/washi";

const m = new Model("Production");

// 变量：明确的数学定义域构造函数
const x = m.integer("desks", { lb: 0 });
const y = m.integer("chairs", { lb: 0 });

// 目标：直观的方向动词
m.maximize(expr`30 * ${x} + 50 * ${y}`);

// 约束：一等公民 constrain() 方法
m.constrain(expr`${x} + 2 * ${y} <= 40`, "Wood_Constraint")
 .constrain(expr`2 * ${x} + ${y} <= 50`, "Labor_Constraint");

// 求解与提取
await m.optimize();
console.log(`Status: ${m.status}`);
console.log(`Profit: ${m.objectiveValue}`);
console.log(`Values:`, m.getValues([x, y]));
```

:::

---

## 🧭 特性与语法对照表

| 概念 | Python (PuLP) | Python (Gurobi) | WaSHI (TypeScript) |
| :--- | :--- | :--- | :--- |
| **创建模型** | `prob = LpProblem(...)` | `m = gp.Model(...)` | `const m = new Model(...)` |
| **0-1 变量** | `LpVariable(..., cat="Binary")` | `m.addVar(vtype=GRB.BINARY)` | `m.binary("x")` 或 `m.binary(items)` |
| **整数变量** | `LpVariable(..., cat="Integer")` | `m.addVar(vtype=GRB.INTEGER)` | `m.integer("x", { lb, ub })` |
| **连续变量** | `LpVariable(..., cat="Continuous")` | `m.addVar(vtype=GRB.CONTINUOUS)` | `m.continuous("x", { lb, ub })` |
| **多维变量** | 字典推导式 | `m.addVars(I, J)` | `m.binary(I, J)` 或 `m.continuous(I, J)` |
| **目标函数** | `prob += expr` | `m.setObjective(expr, GRB.MAXIMIZE)` | `m.maximize(expr)` 或 `m.minimize(expr)` |
| **添加约束** | `prob += expr <= b` | `m.addConstr(expr <= b)` | `m.constrain(expr\`... <= ...\`)` |
| **求和汇总** | `lpSum(...)` | `quicksum(...)` | `sum(...)` |
| **向量内积** | `lpSum(c[i] * x[i] for i in I)` | `x.prod(c)` | `dot(c, x)` |
| **执行求解** | `prob.solve()` | `m.optimize()` | `await m.optimize()` |
| **提取数值** | `pulp.value(x)` | `x.X` | `x.value` 或 `m.getValues(x)` |
| **对偶变量 (影子价格)** | `c.pi` | `c.Pi` | `c.dual` |
| **松弛变量** | `c.slack` | `c.Slack` | `c.slack` |
| **检验数 (Reduced Cost)** | `x.dj` | `x.RC` | `x.reducedCost` |

---

## WaSHI 的核心设计准则

1. **变量即数学定义域**：不需要 `type: "binary"` 这样的字符串标记。`m.binary()`、`m.integer()` 与 `m.continuous()` 提供了精确的定义域类型推导与校验。
2. **模板字面量表达数式**：`expr\`${x} + 2 * ${y} <= 40\`` 带来类型安全且直观的可读性。
3. **纯粹的线性代数运算 (`sum`, `dot`)**：成本与数量的内积只需 `dot(costs, x)` 即可原生支持一维与多维网格对象。
