# Advanced Decomposition Methods & Best Practices

Mixed-Integer Programming (MIP) is exceptionally versatile, but monolithic formulations suffer from well-known structural bottlenecks where standard branch-and-bound solvers slow down exponentially or stall.
WaSHI provides first-class decomposition primitives and high-level orchestrators (`solveColumnGeneration` and `solveBenders`) to make Operations Research (OR) best practices accessible to non-experts.

---

## Why Decomposition? (When Monolithic MIP Stalls)

There are two primary problem structures where naive MIP formulations struggle:

| Problem Structure | Why Monolithic MIP Fails | Best Practice Technique | WaSHI API |
| :--- | :--- | :--- | :--- |
| **Massive Symmetry & Loose Continuous Bounds**<br>*(Cutting Stock, Bin Packing, Vehicle Routing, Crew Rostering)* | Millions of symmetric permutations and a very weak continuous relaxation cause branch-and-bound exploration trees to explode. | **Column Generation**<br>*(Dantzig-Wolfe Decomposition)* | [`solveColumnGeneration()`](#column-generation-solvecolumngeneration) |
| **Complicating Decisions & Multi-Stage Stages**<br>*(Stochastic Planning, Facility Location with Routing, Capacity Planning)* | Coupling design/master choices with extensive scenario or operational subproblems creates an intractable matrix size. | **Benders Decomposition** | [`solveBenders()`](#benders-decomposition-solvebenders) |

---

## Foundational Primitives

WaSHI provides fine-grained modeling primitives to inspect dual information and dynamically modify models:

### 1. Constraint Shadow Prices (`dual` / `shadowPrice`)
Access the dual values (marginal impact on the objective per unit change in RHS) after an LP solve:

```typescript
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual);        // Shadow price
console.log(c.shadowPrice); // Alias for c.dual
console.log(m.solution.duals.capacity);
```

### 2. Continuous LP Relaxation (`model.relax()`)
Decomposition algorithms require solving the continuous LP relaxation to extract dual values. `model.relax()` temporarily relaxes all `Integer` and `Binary` variables to continuous variables within their bounds:

```typescript
// Solves LP relaxation and populates shadow prices in m.solution.duals
const status = await m.relax();
console.log("Theoretical dual bound:", m.objectiveValue);
```

### 3. Dynamic Column Injection (`model.column()`)
Inject a new decision variable along with its objective coefficient and constraint contributions in a single call:

```typescript
const col = m.column({
  name: "pattern_1",
  type: "Integer", // or "Continuous"
  lb: 0,
  cost: 1, // objective coefficient
  coefficients: {
    demand_itemA: 2,
    demand_itemB: 1,
  },
});
```

### 4. Dynamic Constraint Modification (`addTerm` / `setTerm`)
Update the coefficients of individual variables in an existing constraint:

```typescript
const c = m.getConstraintByName("budget")!;
c.addTerm(newVar, 5); // Increments newVar's coefficient by 5
c.setTerm(newVar, 0); // Setting to 0 cleanly removes the term
```

---

## Column Generation (`solveColumnGeneration`)

Column Generation starts with a **Restricted Master Problem (RMP)** with a small subset of columns. In each iteration:
1. It solves the RMP's LP relaxation via `master.relax()`.
2. Passes constraint shadow prices to your `pricing` callback.
3. Your `pricing` callback solves a subproblem (e.g., a knapsack problem) to find candidate columns with negative reduced costs ($\bar{c} = \text{cost} - \sum \pi_i a_i < 0$).
4. Injects improving columns and repeats until the continuous relaxation is optimal.
5. Solves the final master model as a Mixed-Integer Program (MIP) to yield integer solutions.

### Worked Example: Cutting Stock Problem (CSP)

Cut rolls of raw material ($W = 100$) to satisfy order demands for items of widths 45, 36, and 16 with minimum waste:

```typescript
import { Model, expr, minimize, maximize, solveColumnGeneration } from "@ohtaman/washi";

const rollWidth = 100;
const items = [
  { id: "A", width: 45, demand: 10 },
  { id: "B", width: 36, demand: 14 },
  { id: "C", width: 16, demand: 20 },
];

// 1. Define Restricted Master Problem (RMP)
const master = new Model("CuttingStockMaster");
master.objective(minimize(0));

for (const item of items) {
  master.constraint(expr`0 >= ${item.demand}`, `demand_${item.id}`);
}

// Seed with simple initial columns (e.g. cutting only item A, only item B, etc.)
master.column({ cost: 1, type: "Integer", coefficients: { demand_A: 2 } });
master.column({ cost: 1, type: "Integer", coefficients: { demand_B: 2 } });
master.column({ cost: 1, type: "Integer", coefficients: { demand_C: 6 } });

// 2. Solve with automatic column generation
const result = await solveColumnGeneration({
  master,
  finalizeAsMIP: true,
  pricing: async ({ getDual, reducedCostTolerance }) => {
    // Subproblem: Knapsack problem maximizing dual values
    const sub = new Model("KnapsackPricing");
    const a = {
      A: sub.integer("a_A", { lb: 0, ub: 2 }),
      B: sub.integer("a_B", { lb: 0, ub: 2 }),
      C: sub.integer("a_C", { lb: 0, ub: 6 }),
    };

    const dualA = getDual("demand_A");
    const dualB = getDual("demand_B");
    const dualC = getDual("demand_C");

    sub.objective(maximize(expr`${dualA} * ${a.A} + ${dualB} * ${a.B} + ${dualC} * ${a.C}`));
    sub.constraint(expr`45 * ${a.A} + 36 * ${a.B} + 16 * ${a.C} <= ${rollWidth}`);

    await sub.solve();
    const maxDualValue = sub.objectiveValue ?? 0;
    const reducedCost = 1 - maxDualValue;

    // Return new column if it strictly improves the master objective
    if (reducedCost < -reducedCostTolerance) {
      return {
        cost: 1,
        type: "Integer",
        coefficients: {
          demand_A: Math.round(a.A.value ?? 0),
          demand_B: Math.round(a.B.value ?? 0),
          demand_C: Math.round(a.C.value ?? 0),
        },
        reducedCost,
      };
    }
    return null; // Optimal LP bound reached
  },
});

console.log("Optimal rolls needed:", result.objectiveValue); // 14 rolls
console.log("Iterations performed:", result.iterations);
console.log("Columns generated:", result.columnsAdded);
```

---

## Benders Decomposition (`solveBenders`)

Benders Decomposition partitions the problem into:
- **Master Problem**: Contains complicating variables (e.g. binary investment/open decisions $y$) and an auxiliary estimator variable $\theta \ge 0$.
- **Subproblem Callback**: Evaluates operational decisions given tentative master decisions $y^*$, generating **Optimality Cuts** or **Feasibility Cuts**.

### Worked Example: Two-Stage Capacitated Facility Location

```typescript
import { Model, expr, minimize, solveBenders } from "@ohtaman/washi";

const master = new Model("BendersMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");
const theta = master.continuous("theta", { lb: 0 });

// Minimize fixed facility opening costs + estimated operational cost theta
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2} + ${theta}`));
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "capacity_check");

const result = await solveBenders({
  master,
  gapTolerance: 1e-4,
  subproblem: async ({ getMasterValue }) => {
    const open1 = getMasterValue(y1);
    const open2 = getMasterValue(y2);
    const estTheta = getMasterValue(theta);

    // Solve operational dispatch subproblem given open facilities
    const sub = new Model("DispatchSubproblem");
    // ... define transportation flow variables and demand constraints ...
    await sub.solve();

    const actualCost = sub.objectiveValue!;
    if (estTheta < actualCost - 1e-4) {
      // Build Benders Optimality Cut using subproblem dual values
      const cut = expr`${theta} - 50 * ${sub.solution.duals.cap_F1} * ${y1} - 60 * ${sub.solution.duals.cap_F2} * ${y2} >= ${demandConstant}`;
      return {
        kind: "optimality",
        constraint: cut,
        subproblemObjective: 100 * open1 + 120 * open2 + actualCost,
      };
    }
    return null; // Converged
  },
});

console.log("Optimal total cost:", result.objectiveValue);
console.log("Cuts added:", result.cutsAdded);
```
