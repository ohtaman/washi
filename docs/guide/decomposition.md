# Decomposition Methods (`solveColumnGeneration` & `solveBenders`)

When monolithic Mixed-Integer Programming (MIP) models have exponentially many candidate patterns or large multi-stage subproblems, WaSHI provides two high-level decomposition orchestrators—`master.solveColumnGeneration()` and `master.solveBenders()`—along with low-level primitives for dual inspection and dynamic model updates.

| Decomposition Method | WaSHI Orchestrator | Typical Use Case |
| :--- | :--- | :--- |
| **Column Generation** *(Dantzig-Wolfe)* | [`master.solveColumnGeneration()`](#column-generation-solvecolumngeneration) | Models with exponentially many patterns, routes, or schedules (e.g., Cutting Stock, Vehicle Routing, Crew Rostering). |
| **Benders Decomposition** *(and Lazy Cuts)* | [`master.solveBenders()`](#benders-decomposition-solvebenders) | Two-stage or complicating-variable problems (e.g., Facility Location + Dispatch, Stochastic Planning, TSP Subtour Elimination). |

---

## Foundational Primitives

WaSHI exposes four lower-level primitives used internally by the decomposition orchestrators and available directly for custom algorithms:

### 1. Constraint Duals (`c.dual`)
After solving a continuous linear program (LP), read the shadow price (marginal impact on the objective per unit change in RHS) of each constraint:

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

m.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual);                    // Dual value / shadow price
console.log(m.solution?.duals.capacity); // Lookup by constraint name
```

### 2. Continuous LP Relaxation (`m.relax()`)
`m.relax()` temporarily relaxes all `Integer` and `Binary` variables to continuous variables within their `[lb, ub]` bounds and solves the LP relaxation so constraint duals are populated:

```typescript
// Solves the continuous LP relaxation and populates m.solution.duals
const status = await m.relax();
console.log("LP relaxation bound:", m.objectiveValue);
```

### 3. Dynamic Column Injection (`m.addColumn()`)
Create a new decision variable, set its objective coefficient, and attach its non-zero coefficients to existing named constraints in a single call:

```typescript
const col = m.addColumn({
  name: "pattern_1",
  type: "Integer", // or "Continuous" / "Binary"
  lb: 0,
  cost: 1, // Objective coefficient
  coefficients: {
    capacity: 2,
  },
});
```

### 4. Dynamic Constraint Term Updates (`c.addTerm()` / `c.setTerm()`)
Increment or overwrite the coefficient of a variable inside an existing linear constraint:

```typescript
const extra = m.continuous("extra", { lb: 0 });
const budget = m.constraint(expr`${x} + ${y} <= 20`, "budget");

budget.addTerm(extra, 5); // Adds +5 * extra to the LHS
budget.setTerm(extra, 0); // Setting 0 removes extra from the constraint
```

---

## Column Generation (`solveColumnGeneration`)

`master.solveColumnGeneration(options)` starts from a **Restricted Master Problem (RMP)** containing an initial feasible subset of columns and executes the column generation loop:
1. Solves the continuous LP relaxation of the master problem via `master.relax()`.
2. Invokes your `pricing` callback with the current dual shadow prices (`duals`, `getDual`).
3. Evaluates candidate columns (`ColumnProposal` or `ColumnProposal[]`), dynamically injecting those with improving reduced costs ($\bar{c} = \text{cost} - \sum_i \pi_i a_i < 0$ when minimizing).
4. Repeats until `pricing` returns `null` / `[]` or no column improves the objective beyond `reducedCostTolerance`.
5. Optionally solves the final master model as a MIP (`finalizeAsMIP: true`, the default) to obtain an integer solution over all generated columns.

### Pricing with a WaSHI Subproblem Model

```typescript
import { Model, expr, minimize, maximize } from "@ohtaman/washi";

const rollWidth = 100;

// 1. Restricted Master Problem (RMP) with simple single-item initial patterns
const master = new Model("CuttingStockMaster");
const pA = master.integer("init_A", { lb: 0 }); // 2 of A (width 45) per roll
const pB = master.integer("init_B", { lb: 0 }); // 2 of B (width 36) per roll
const pC = master.integer("init_C", { lb: 0 }); // 6 of C (width 16) per roll

master.objective(minimize(expr`${pA} + ${pB} + ${pC}`));
const demandA = master.constraint(expr`2 * ${pA} >= 10`, "demand_A");
const demandB = master.constraint(expr`2 * ${pB} >= 14`, "demand_B");
const demandC = master.constraint(expr`6 * ${pC} >= 20`, "demand_C");

// 2. Run Column Generation
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    // Knapsack pricing subproblem: find a pattern maximizing total dual value
    const sub = new Model("KnapsackPricing");
    const aA = sub.integer("a_A", { lb: 0, ub: 2 });
    const aB = sub.integer("a_B", { lb: 0, ub: 2 });
    const aC = sub.integer("a_C", { lb: 0, ub: 6 });

    const dualA = demandA.dual ?? 0;
    const dualB = demandB.dual ?? 0;
    const dualC = demandC.dual ?? 0;
    sub.objective(maximize(expr`${dualA} * ${aA} + ${dualB} * ${aB} + ${dualC} * ${aC}`));
    sub.constraint(expr`45 * ${aA} + 36 * ${aB} + 16 * ${aC} <= ${rollWidth}`);

    await sub.solve();

    return {
      cost: 1,
      type: "Integer",
      coefficients: {
        demand_A: Math.round(aA.value ?? 0),
        demand_B: Math.round(aB.value ?? 0),
        demand_C: Math.round(aC.value ?? 0),
      },
    };
  },
});

console.log("Optimal rolls:", result.objectiveValue); // 14
console.log("Iterations:", result.iterations);
console.log("Columns added:", result.columnsAdded);
```

### Pricing with a Custom Algorithm (`getDual`)

Because `pricing` is a standard callback receiving `PricingContext`, you can also solve the pricing problem directly in TypeScript (e.g., via combinatorial search, dynamic programming, or shortest-path routines) instead of constructing a subproblem `Model`:

```typescript
const customResult = await master.solveColumnGeneration({
  maxIterations: 100,
  reducedCostTolerance: 1e-6,
  pricing: ({ getDual }) => {
    const dA = getDual("demand_A");
    const dB = getDual("demand_B");
    const dC = getDual("demand_C");

    // Search feasible patterns (45*aA + 36*aB + 16*aC <= rollWidth) for negative reduced cost (1 - dualSum < -1e-6)
    let bestDualSum = 1 + 1e-6;
    let best: { demand_A: number; demand_B: number; demand_C: number } | null = null;
    for (let aA = 0; 45 * aA <= rollWidth; aA++) {
      for (let aB = 0; 45 * aA + 36 * aB <= rollWidth; aB++) {
        for (let aC = 0; 45 * aA + 36 * aB + 16 * aC <= rollWidth; aC++) {
          const dualSum = dA * aA + dB * aB + dC * aC;
          if (dualSum > bestDualSum) {
            bestDualSum = dualSum;
            best = { demand_A: aA, demand_B: aB, demand_C: aC };
          }
        }
      }
    }
    return best ? { cost: 1, type: "Integer", coefficients: best } : null;
  },
});
```

---

## Benders Decomposition (`solveBenders`)

`master.solveBenders(options)` partitions a problem into a **Master Problem** (holding first-stage or complicating variables) and a **Subproblem** evaluated at each master candidate solution to generate **Optimality Cuts** or **Feasibility Cuts**.

### Automatic Cut Generation (`sub.link()`)

Return a continuous LP subproblem `Model` from `subproblem` and declare cross-model constraints via `sub.link(...)`. WaSHI automatically manages the auxiliary cost estimator variable $\theta$, substitutes master candidate values, extracts subproblem duals, and adds Benders cuts until convergence:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// 1. Master problem: binary facility opening decisions
const master = new Model("FacilityMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");

// Fixed opening costs (theta for operational subproblem cost is managed automatically)
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2}`));
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "total_capacity_floor");

// 2. Solve with automatic Benders cut generation
const result = await master.solveBenders({
  gapTolerance: 1e-4,
  subproblem: () => {
    const sub = new Model("DispatchSubproblem");
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

    sub.constraint(expr`${x11} + ${x21} >= 20`, "demand_C1");
    sub.constraint(expr`${x12} + ${x22} >= 25`, "demand_C2");
    sub.constraint(expr`${x13} + ${x23} >= 30`, "demand_C3");

    // Link subproblem dispatch flows to master binary variables y1, y2
    sub.link(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.link(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub;
  },
});

console.log("Optimal total cost:", result.objectiveValue); // 390
console.log("Cuts added:", result.cutsAdded);
console.log("Open facilities:", result.values);
```

> [!NOTE]
> **`theta` Lower Bound for Negative Subproblem Objectives**: When `sub.link(...)` is used without an explicit `theta` variable, WaSHI injects `__benders_theta` with default `lb: 0` (assuming non-negative subproblem costs). If your subproblem objective can take negative values (e.g., rebate or profit terms), declare `const theta = master.continuous("theta", { lb: -1e6 })`, include `+ ${theta}` in `master.objective(...)`, and pass `{ theta }` in `solveBenders(options)`.

### Manual Cut Generation (`BendersCut` / Lazy Constraints)

For combinatorial separation (such as lazy subtour elimination) or custom analytical cuts, return one `BendersCut` object, an array `BendersCut[]`, or `null` when converged:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const master = new Model("ManualBenders");
const y = master.binary("y");
const theta = master.continuous("theta", { lb: 0 });
master.objective(minimize(expr`40 * ${y} + ${theta}`));

const result = await master.solveBenders({
  theta,
  gapTolerance: 1e-4,
  subproblem: ({ getMasterValue }) => {
    const yVal = getMasterValue(y);
    const estTheta = getMasterValue(theta);

    // Operational cost is 100 when y = 0, or 30 when y = 1
    const actualSubCost = 100 - 70 * yVal;
    if (estTheta < actualSubCost - 1e-4) {
      return {
        kind: "optimality", // or "feasibility" for lazy combinatorial cuts
        constraint: expr`${theta} >= 100 - 70 * ${y}`,
        subproblemObjective: 40 * yVal + actualSubCost,
      };
    }
    return null; // Converged
  },
});

console.log(result.objectiveValue); // 70 (y = 1, theta = 30)
```

---

## Related Examples & Formulation Tips

- **Full Decomposition Walkthroughs**:
  - [Vehicle Routing Problem (`solveColumnGeneration`)](../examples/vehicle-routing.md)
  - [Traveling Salesperson Problem (`solveBenders` lazy subtour elimination)](../examples/traveling-salesperson.md)
- **Formulation Tips**: See [Formulation Patterns & Optimization Tips](./formulation-tips.md#_5-decomposition-formulation-tips) for Set Covering (`>= 1`) vs. Set Partitioning (`== 1`), Price-and-Branch (`finalizeAsMIP`), and multi-cut separation.
