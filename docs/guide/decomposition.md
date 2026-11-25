# Decomposition Methods (`solveColumnGeneration` & `solveBenders`)

When a single LP or MIP model has too many columns to enumerate upfront, or splits naturally into two decision stages, WaSHI provides two decomposition helpers:

| Method | WaSHI API | When to use |
| :--- | :--- | :--- |
| **Column Generation** | [`master.solveColumnGeneration()`](#column-generation-solvecolumngeneration) | Models with exponentially many patterns, routes, or shifts (Cutting Stock, VRP, Crew Rostering). |
| **Benders Decomposition** | [`master.solveBenders()`](#benders-decomposition-solvebenders) | Two-stage problems (Facility Location + Dispatch) or lazy constraints added on demand (TSP Subtour Elimination). |

Both helpers are also exported as standalone functions—`solveColumnGeneration({ master, ... })` and `solveBenders({ master, ... })`—alongside the `Model` methods.

---

## Column Generation (`solveColumnGeneration`)

Column Generation solves large linear and integer models whose variables (columns) are too numerous to enumerate upfront.
It splits the problem into two parts:

- **Restricted Master Problem (RMP)**: The master `Model`, initialized with a small feasible subset of columns.
- **Pricing Subproblem**: A callback (`pricing`) that reads the RMP's LP dual values and searches for a new column that improves the objective.

Each call to `master.solveColumnGeneration()` runs this loop:

1. Solves the LP relaxation of the RMP (`master.relax()`) to obtain each constraint's **dual value** (shadow price).
2. Passes those duals (`duals`, `getDual`) to your `pricing` callback.
3. Checks whether each returned `ColumnProposal` improves the objective beyond `reducedCostTolerance` using its **reduced cost** (computed automatically as $\bar{c} = \text{cost} - \sum_i \pi_i a_i$ when `reducedCost` is omitted).
4. Adds any improving column ($\bar{c} < -\varepsilon$ when minimizing, or $\bar{c} > \varepsilon$ when maximizing, with $\varepsilon$ = `reducedCostTolerance`). The loop repeats until `pricing` returns `null` / `[]`, no improving column remains, or `maxIterations` is reached.
5. Optionally solves the final RMP with all generated columns as an integer program (`finalizeAsMIP: true`, enabled by default).

> [!IMPORTANT]
> **Preconditions & Guarantees**:
> - **Feasible & bounded initial RMP**: Starting columns (or penalized artificial slacks) must make the initial LP relaxation feasible and bounded so a finite optimum and valid duals exist.
> - **LP-dual solver required**: Requires HiGHS or GLPK; Pumpkin and Z3 do not produce LP duals.
> - **Price-and-Branch heuristic**: `finalizeAsMIP: true` solves one MIP over root-LP columns only—fast and practical, but not exact Branch-and-Price.

### Example: Pricing with a Subproblem `Model`

In the Cutting Stock problem below, the RMP starts with three single-item patterns and the pricing subproblem solves a knapsack model to find better roll patterns.
Because `solveColumnGeneration()` checks reduced cost automatically, `pricing` can simply return the best pattern found by the subproblem:

```typescript
import { Model, expr, minimize, maximize } from "@ohtaman/washi";

const rollWidth = 100;

// 1. Master problem: start with simple single-item cutting patterns
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
  pricing: async ({ getDual }) => {
    // Subproblem: find a valid roll pattern maximizing total dual value
    const sub = new Model("KnapsackPricing");
    const aA = sub.integer("a_A", { lb: 0, ub: 2 });
    const aB = sub.integer("a_B", { lb: 0, ub: 2 });
    const aC = sub.integer("a_C", { lb: 0, ub: 6 });

    const dualA = getDual(demandA);
    const dualB = getDual(demandB);
    const dualC = getDual(demandC);
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

### Example: Pricing with Plain TypeScript (`getDual`)

You do not need to build a subproblem `Model` inside `pricing`.
You can run any TypeScript algorithm—such as dynamic programming or a search loop—using `getDual(constraintName)`:

```typescript
const customResult = await master.solveColumnGeneration({
  maxIterations: 100,
  reducedCostTolerance: 1e-6,
  pricing: ({ getDual }) => {
    const dA = getDual("demand_A");
    const dB = getDual("demand_B");
    const dC = getDual("demand_C");

    // Search for a pattern with negative reduced cost (1 - dualSum < -1e-6)
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

`master.solveBenders(options)` splits a problem into a **master problem** for first-stage decisions and a **subproblem** for second-stage evaluation.
On each iteration, the subproblem evaluates the master's candidate solution and `solveBenders()` adds the resulting linear constraints (**cuts**) back to the master:

- **Optimality cut (`kind: "optimality"`)**: Tightens the master's estimate (`theta`) of the subproblem objective when the candidate is feasible but its true second-stage cost exceeds the estimate (for minimization; for maximization, tightens the upper bound when the true value is lower).
- **Feasibility cut (`kind: "feasibility"`)**: Rules out a master candidate when the subproblem is infeasible or violates a lazy structural rule (such as a disconnected TSP subtour).

### Automatic Cut Generation (`sub.link()`)

Return a continuous LP subproblem `Model` from `subproblem` and connect it to master variables using `sub.link(...)`.
WaSHI manages the cost estimator `theta`, substitutes current master values, extracts duals from the LP subproblem, and adds optimality cuts until the bound gap falls within `gapTolerance`:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// 1. Master problem: binary facility opening decisions
const master = new Model("FacilityMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");

// Fixed opening costs (operational cost estimator theta is added automatically)
master.objective(minimize(expr`100 * ${y1} + 120 * ${y2}`));
master.constraint(expr`50 * ${y1} + 60 * ${y2} >= 75`, "total_capacity_floor");

// 2. Solve with automatic Benders cuts
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
console.log("Master values:", result.values);
```

> [!IMPORTANT]
> **Preconditions for Automatic `sub.link()` Mode**:
> - **Optimality cuts only**: Throws if any master candidate makes the LP subproblem infeasible. Add master feasibility guards (like `total_capacity_floor`) or use manual `kind: "feasibility"` cuts.
> - **Explicit `theta` for `Maximize` or negative costs**: Auto-`theta` assumes a `Minimize` master with `lb: 0`. For `Maximize` or negative subproblem objectives, declare `theta` on `master` with appropriate bounds, include it in `master.objective()`, and pass `{ theta }`.
> - **LP-dual solver required**: Requires HiGHS or GLPK to solve the continuous LP subproblem.

### Manual Cut Generation (`BendersCut` / Lazy Constraints)

For custom cuts, feasibility cuts, or lazy constraints (such as TSP subtour elimination), return a `BendersCut`, a `BendersCut[]`, or `null` when converged.
When returning an optimality cut, pass the **total evaluated objective** (first-stage objective *excluding* `theta`, plus the actual subproblem objective) in `subproblemObjective` so WaSHI can compare it against the master's bound to compute the optimality gap:

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

## Low-Level Primitives (Custom Loops)

If you want to build your own decomposition loop instead of using the helpers above, WaSHI exposes four building blocks:

### 1. Constraint Duals (`c.dual`)

After solving a continuous LP, read each constraint's dual value (shadow price):

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

m.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual);                     // Dual value / shadow price
console.log(m.solution?.duals.capacity); // Lookup by constraint name
```

### 2. Continuous LP Relaxation (`m.relax()`)

`m.relax()` temporarily relaxes all `Integer` variables to continuous `[lb, ub]` and `Binary` variables to `[0, 1]`, then solves the LP so dual values are available:

```typescript
const status = await m.relax();
console.log("LP relaxation bound:", m.objectiveValue);
```

### 3. Dynamic Column Injection (`m.column()`)

Add a new variable, set its objective coefficient, and attach it to existing named constraints in one call:

```typescript
const col = m.column({
  name: "pattern_1",
  type: "Integer", // or "Continuous" / "Binary"
  lb: 0,
  cost: 1, // Objective coefficient
  coefficients: {
    capacity: 2,
  },
});
```

### 4. Dynamic Constraint Updates (`c.addTerm()` / `c.setTerm()`)

Add to (introducing the variable if not yet present) or overwrite a variable's coefficient in an existing linear constraint:

```typescript
const extra = m.continuous("extra", { lb: 0 });
const budget = m.constraint(expr`${x} + ${y} <= 20`, "budget");

budget.addTerm(extra, 5); // Adds +5 * extra to the left-hand side
budget.setTerm(extra, 0); // Setting 0 removes extra from the constraint
```

---

## Related Examples & Tips

- [Vehicle Routing Problem (`solveColumnGeneration`)](../examples/vehicle-routing.md)
- [Traveling Salesperson Problem (`solveBenders` lazy subtour elimination)](../examples/traveling-salesperson.md)
- [Formulation Patterns & Tips](./formulation-tips.md#_5-decomposition-formulation-tips)
