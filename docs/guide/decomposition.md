# Advanced Decomposition Methods & Best Practices

Mixed-Integer Programming (MIP) is exceptionally versatile, but monolithic formulations suffer from well-known structural bottlenecks where standard branch-and-bound solvers slow down exponentially or stall.
WaSHI provides first-class decomposition orchestrators (`master.solveColumnGeneration` and `master.solveBenders`) along with fine-grained modeling primitives to make Operations Research (OR) best practices accessible to non-experts.

---

## Why Decomposition? (When Monolithic MIP Stalls)

There are two primary problem structures where naive MIP formulations struggle:

| Problem Structure | Why Monolithic MIP Fails | Best Practice Technique | WaSHI API |
| :--- | :--- | :--- | :--- |
| **Massive Symmetry & Loose Continuous Bounds**<br>*(Cutting Stock, Bin Packing, Vehicle Routing, Crew Rostering)* | Millions of symmetric permutations and a very weak continuous relaxation cause branch-and-bound exploration trees to explode. | **Column Generation**<br>*(Dantzig-Wolfe Decomposition)* | [`master.solveColumnGeneration()`](#column-generation-solvecolumngeneration) |
| **Complicating Decisions & Multi-Stage Stages**<br>*(Stochastic Planning, Facility Location with Routing, Capacity Planning)* | Coupling design/master choices with extensive scenario or operational subproblems creates an intractable matrix size. | **Benders Decomposition** | [`master.solveBenders()`](#benders-decomposition-solvebenders) |

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
2. Evaluates a pricing subproblem using constraint shadow prices.
3. Finds candidate columns with negative reduced costs ($\bar{c} = \text{cost} - \sum \pi_i a_i < 0$) and dynamically injects them into the master problem.
4. Repeats until no improving columns exist.
5. Finally solves the full master model as a Mixed-Integer Program (`finalizeAsMIP: true`) to obtain optimal integer solutions.

### Recommended: Fully Automated Column Generation via Declarative Subproblems

Simply pass the pricing `Model` and a variable-to-constraint `mapping`. WaSHI automatically constructs the dual pricing objective, verifies reduced costs, and injects columns:

```typescript
import { Model, expr, minimize, maximize } from "@ohtaman/washi";

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

// Add simple initial single-cut patterns
master.column({ cost: 1, type: "Integer", coefficients: { demand_A: 2 } });
master.column({ cost: 1, type: "Integer", coefficients: { demand_B: 2 } });
master.column({ cost: 1, type: "Integer", coefficients: { demand_C: 6 } });

// 2. Define pricing subproblem (knapsack model)
const sub = new Model("KnapsackPricing");
const a = {
  A: sub.integer("a_A", { lb: 0, ub: 2 }),
  B: sub.integer("a_B", { lb: 0, ub: 2 }),
  C: sub.integer("a_C", { lb: 0, ub: 6 }),
};
sub.constraint(expr`45 * ${a.A} + 36 * ${a.B} + 16 * ${a.C} <= ${rollWidth}`);

// 3. Solve automatically with master.solveColumnGeneration()
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  subproblem: {
    model: sub,
    mapping: {
      demand_A: a.A,
      demand_B: a.B,
      demand_C: a.C,
    },
    cost: 1,
  },
});

console.log("Optimal rolls needed:", result.objectiveValue); // 14
console.log("Iterations executed:", result.iterations);
console.log("Dynamic columns added:", result.columnsAdded);
```

### Low-Level Control: Custom `pricing` Callback

For specialized subproblem solvers (e.g., shortest path on graphs), you can supply a manual `pricing` callback:

```typescript
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async ({ getDual, reducedCostTolerance }) => {
    const dualA = getDual("demand_A");
    const dualB = getDual("demand_B");
    const dualC = getDual("demand_C");

    // Solve subproblem with custom algorithm
    const pattern = solveSpecializedKnapsack(dualA, dualB, dualC);
    const reducedCost = 1 - pattern.dualValue;

    if (reducedCost < -reducedCostTolerance) {
      return {
        cost: 1,
        type: "Integer",
        coefficients: pattern.coefficients,
        reducedCost,
      };
    }
    return null; // Optimum reached
  },
});
```

---

## Benders Decomposition (`solveBenders`)

Benders Decomposition partitions the problem into:
- **Master Problem**: Contains complicating variables (e.g., 0-1 facility opening decisions $y$) and an auxiliary variable $\theta \ge 0$ representing estimated subproblem costs.
- **Subproblem**: Solves operational decisions given fixed master values $y^*$, feeding back **Optimality Cuts** to the master.

### Recommended: Fully Automated Cut Generation with `sub.link()`

Return the subproblem `Model` from your callback and register linking constraints with `sub.link(...)`. WaSHI automatically manages $\theta$, evaluates master candidate values, extracts duals, and injects Benders optimality cuts:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// 1. Master problem: Facility location decisions
const master = new Model("FacilityMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");

// Objective: Fixed facility costs (theta is managed automatically)
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2}`));
// Minimal aggregate capacity requirement
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "capacity_check");

// 2. Solve automatically with master.solveBenders()
const result = await master.solveBenders({
  gapTolerance: 1e-4,
  subproblem: () => {
    // Operational dispatch subproblem
    const sub = new Model("TransportSubproblem");
    const x11 = sub.continuous("x_11", { lb: 0 });
    const x12 = sub.continuous("x_12", { lb: 0 });
    const x13 = sub.continuous("x_13", { lb: 0 });
    const x21 = sub.continuous("x_21", { lb: 0 });
    const x22 = sub.continuous("x_22", { lb: 0 });
    const x23 = sub.continuous("x_23", { lb: 0 });

    sub.objective(
      minimize(
        expr`3 * ${x11} + 4 * ${x12} + 2 * ${x13} + 4 * ${x21} + 2 * ${x22} + 3 * ${x23}`
      )
    );

    // Customer demand constraints
    sub.constraint(expr`${x11} + ${x21} >= 20`, "demand_C1");
    sub.constraint(expr`${x12} + ${x22} >= 25`, "demand_C2");
    sub.constraint(expr`${x13} + ${x23} >= 30`, "demand_C3");

    // Link subproblem flows with master decisions y1, y2
    sub.link(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.link(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub; // Returning the model automatically generates cuts!
  },
});

console.log("Optimal total cost:", result.objectiveValue); // 390
console.log("Iterations:", result.iterations);
console.log("Cuts added:", result.cutsAdded);
console.log("Facility decisions:", {
  F1: result.values.open_F1,
  F2: result.values.open_F2,
});
```

### Low-Level Control: Custom `BendersCut` Callback

You can also construct Benders cuts manually by returning `BendersCut` objects:

```typescript
const result = await master.solveBenders({
  gapTolerance: 1e-4,
  subproblem: async ({ getMasterValue }) => {
    const open1 = getMasterValue(y1);
    const open2 = getMasterValue(y2);
    const estTheta = getMasterValue("theta");

    const sub = new Model("TransportSubproblem");
    // ...
    await sub.solve();

    const actualCost = sub.objectiveValue!;
    if (estTheta < actualCost - 1e-4) {
      return {
        kind: "optimality",
        constraint: expr`theta - 50 * ${sub.solution.duals.cap1} * ${y1} - 60 * ${sub.solution.duals.cap2} * ${y2} >= ${rhs}`,
        subproblemObjective: 100 * open1 + 120 * open2 + actualCost,
      };
    }
    return null; // Converged
  },
});
```

---

## Unified Syntax via `master.solve()`

You can also invoke decomposition directly from the standard `master.solve()` API:

```typescript
// Benders decomposition
const status = await master.solve({
  benders: {
    gapTolerance: 1e-4,
    subproblem: () => {
      // ...
      return sub;
    },
  },
});

// Column generation
const status = await master.solve({
  columnGeneration: {
    finalizeAsMIP: true,
    subproblem: {
      model: sub,
      mapping: { demand_A: a.A },
      cost: 1,
    },
  },
});

// Access decomposition details anytime
console.log(master.decomposition?.iterations);
```
