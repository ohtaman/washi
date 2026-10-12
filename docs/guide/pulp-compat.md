# Migrating from Python (PuLP & Gurobi)

For data scientists and optimization engineers transitioning from Python, WaSHI provides a mathematically pure algebraic modeling interface that eliminates boilerplate while retaining intuitive syntax.

Rather than replicating Python quirks (such as special sum functions or artificial wrapper classes), WaSHI aligns directly with mathematical optimization concepts: variables are domains, constraints are assertions, and objectives are directions.

---

## Direct Code Comparison

::: code-group

```python [Python (PuLP)]
import pulp

prob = pulp.LpProblem("Production", pulp.LpMaximize)

# Variables
x = pulp.LpVariable("desks", lowBound=0, cat="Integer")
y = pulp.LpVariable("chairs", lowBound=0, cat="Integer")

# Objective
prob += 30 * x + 50 * y, "Total_Profit"

# Constraints
prob += x + 2 * y <= 40, "Wood_Constraint"
prob += 2 * x + y <= 50, "Labor_Constraint"

# Solve & extract
prob.solve()
print(f"Status: {pulp.LpStatus[prob.status]}")
print(f"Profit: {pulp.value(prob.objective)}")
print(f"x: {pulp.value(x)}, y: {pulp.value(y)}")
```

```python [Python (Gurobi)]
import gurobipy as gp
from gurobipy import GRB

m = gp.Model("Production")

# Variables
x = m.addVar(name="desks", lb=0, vtype=GRB.INTEGER)
y = m.addVar(name="chairs", lb=0, vtype=GRB.INTEGER)

# Objective
m.setObjective(30 * x + 50 * y, GRB.MAXIMIZE)

# Constraints
m.addConstr(x + 2 * y <= 40, "Wood_Constraint")
m.addConstr(2 * x + y <= 50, "Labor_Constraint")

# Optimize & extract
m.optimize()
print(f"Status: {m.Status}")
print(f"Profit: {m.ObjVal}")
print(f"x: {x.X}, y: {y.X}")
```

```typescript [TypeScript (WaSHI)]
import { Model, expr } from "@ohtaman/washi";

const m = new Model("Production");

// Variables: domain-specific constructors
const x = m.integer("desks", { lb: 0 });
const y = m.integer("chairs", { lb: 0 });

// Objective: direct direction verbs
m.maximize(expr`30 * ${x} + 50 * ${y}`);

// Constraints: first-class constrain() method
m.constrain(expr`${x} + 2 * ${y} <= 40`, "Wood_Constraint")
 .constrain(expr`2 * ${x} + ${y} <= 50`, "Labor_Constraint");

// Optimize & extract
await m.optimize();
console.log(`Status: ${m.status}`);
console.log(`Profit: ${m.objectiveValue}`);
console.log(`Values:`, m.getValues([x, y]));
```

:::

---

## 🧭 Feature & Syntax Mapping

| Concept | Python (PuLP) | Python (Gurobi) | WaSHI (TypeScript) |
| :--- | :--- | :--- | :--- |
| **Model Creation** | `prob = LpProblem(...)` | `m = gp.Model(...)` | `const m = new Model(...)` |
| **Binary Variable** | `LpVariable(..., cat="Binary")` | `m.addVar(vtype=GRB.BINARY)` | `m.binary("x")` or `m.binary(items)` |
| **Integer Variable** | `LpVariable(..., cat="Integer")` | `m.addVar(vtype=GRB.INTEGER)` | `m.integer("x", { lb, ub })` |
| **Continuous Variable** | `LpVariable(..., cat="Continuous")` | `m.addVar(vtype=GRB.CONTINUOUS)` | `m.continuous("x", { lb, ub })` |
| **Multi-dimensional Vars** | Dict comprehension | `m.addVars(I, J)` | `m.binary(I, J)` or `m.continuous(I, J)` |
| **Objective** | `prob += expr` | `m.setObjective(expr, GRB.MAXIMIZE)` | `m.maximize(expr)` or `m.minimize(expr)` |
| **Constraint** | `prob += expr <= b` | `m.addConstr(expr <= b)` | `m.constrain(expr\`... <= ...\`)` |
| **Summation** | `lpSum(...)` | `quicksum(...)` | `sum(...)` |
| **Dot Product** | `lpSum(c[i] * x[i] for i in I)` | `x.prod(c)` | `dot(c, x)` |
| **Solve / Optimize** | `prob.solve()` | `m.optimize()` | `await m.optimize()` |
| **Solution Value** | `pulp.value(x)` | `x.X` | `x.value` or `m.getValues(x)` |
| **Duals (Shadow Price)** | `c.pi` | `c.Pi` | `c.dual` |
| **Slack** | `c.slack` | `c.Slack` | `c.slack` |
| **Reduced Cost** | `x.dj` | `x.RC` | `x.reducedCost` |

---

## Key Design Principles in WaSHI

1. **Variables are Domains**: No need for `type: "binary"` string flags. `m.binary()`, `m.integer()`, and `m.continuous()` declare the exact mathematical nature of your decision variables.
2. **Template Literals as Formulas**: Math expressions use standard template literals: `expr\`${x} + 2 * ${y} <= 40\``. Type-safe, human-readable, and zero AST parsing overhead.
3. **Pure Linear Algebra (`sum`, `dot`)**: Inner products like cost times quantity are written as `dot(costs, x)`, naturally handling both 1D maps and nested multi-dimensional grids.

