# GLPK Solver Engine

The **GNU Linear Programming Kit (GLPK)** is a long-standing, robust simplex and interior-point solver package intended for solving large-scale linear programming (LP) and mixed integer programming (MIP).

---

## Installation

GLPK is provided as an optional peer dependency via `glpk.js`:

```bash
npm install glpk.js
```

---

## Licensing Consideration (GPL-3.0)

GLPK is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

- Because WaSHI is MIT-licensed, `glpk.js` is **never bundled statically** in the core package.
- It is dynamically imported only if you explicitly register or invoke `@ohtaman/washi/solvers/glpk`.
- Ensure your project's distribution requirements comply with the GPL-3.0 license when shipping products that bundle GLPK.

---

## Basic Usage

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/glpk";

const model = new Model({ solver: "glpk" });

const x = model.continuous("x", { lb: 0, ub: 10 });
const y = model.continuous("y", { lb: 0, ub: 20 });

model.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
model.constraint(expr`${x} + ${y} <= 15`, "cap");

await model.solve();

console.log("GLPK Status:", model.status);
console.log("Objective:", model.objectiveValue);
```

---

## Result Semantics & Status Mapping

### Solver Statuses
GLPK return codes are mapped strictly to WaSHI `SolverStatus`:
- `GLP_OPT` (5) $\to$ `"Optimal"`
- `GLP_FEAS` (2) $\to$ `"Feasible"` (feasible MIP incumbent found)
- `GLP_INFEAS` (3) / `GLP_NOFEAS` (4) $\to$ `"Infeasible"`
- `GLP_UNBND` (6) $\to$ `"Unbounded"`
- `GLP_UNDEF` (1) and unrecognized/missing statuses $\to$ `"Unknown"` (never misclassified as `"Optimal"`)

### Solution Availability
- Variable values (`model.values`, `var.value`) and objective values (`model.objectiveValue`) are exposed **only** when a valid primal solution is available (`"Optimal"` or `"Feasible"`).
- For unsuccessful or non-optimal solves (`Infeasible`, `Unbounded`, `Unknown`, `Error`), `model.objectiveValue` is `null` and variable values remain `null` without fabricating fake all-zero solutions.

### Differences Between LP and MIP
- **Linear Programming (LP)**: Solved using the simplex algorithm. Dual values (shadow prices via `constraint.dual`) and slacks are populated for optimal solutions.
- **Mixed-Integer Programming (MIP)**: Solved using the branch-and-cut algorithm. Produces integer-feasible primal variable solutions; dual values are mathematically undefined for discrete optimization and omitted.

