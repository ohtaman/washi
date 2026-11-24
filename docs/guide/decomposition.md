# Decomposition Methods (`solveColumnGeneration` & `solveBenders`)

When a single MIP model has too many possible combinations to list up front, or splits naturally into two stages, WaSHI provides two decomposition helpers:

| Method | WaSHI API | When to use |
| :--- | :--- | :--- |
| **Column Generation** | [`master.solveColumnGeneration()`](#column-generation-solvecolumngeneration) | Too many patterns, routes, or shifts to enumerate (e.g., Cutting Stock, Vehicle Routing, Crew Rostering). |
| **Benders Decomposition** | [`master.solveBenders()`](#benders-decomposition-solvebenders) | Two-stage decisions (e.g., Facility Location + Dispatch) or lazy constraints added only when violated (e.g., TSP Subtour Elimination). |

---

## Column Generation (`solveColumnGeneration`)

Instead of creating a variable for every possible cutting pattern or route up front, `solveColumnGeneration()` starts with a small set of initial patterns (the **master problem**) and asks your `pricing` callback to generate new, better patterns on demand:

1. Solves a continuous LP relaxation (`master.relax()`) of the current patterns to get each constraint's **dual value** (shadow price—how much relaxing that constraint improves the objective).
2. Calls your `pricing` callback with those dual values (`duals`, `getDual`).
3. Adds any returned pattern (`ColumnProposal`) whose cost is lower than its dual savings (negative **reduced cost**: $\bar{c} = \text{cost} - \sum_i \pi_i a_i < 0$ when minimizing).
4. Repeats until `pricing` returns `null` / `[]` or no improving pattern remains.
5. Solves the final master model as an integer program (`finalizeAsMIP: true`, the default).

### Example: Pricing with a Subproblem `Model`

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
  pricing: async () => {
    // Subproblem: find a valid roll pattern maximizing total dual value
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

### Example: Pricing with Plain TypeScript (`getDual`)

You do not have to build a subproblem `Model` inside `pricing`. You can use any TypeScript algorithm (such as dynamic programming or a loop) with `getDual(constraintName)`:

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

`master.solveBenders(options)` splits a problem into:
- **Master problem**: Holds high-level or integer decisions (e.g., which facilities to open).
- **Subproblem**: Evaluates each master candidate solution and adds linear constraints (**cuts**) back to the master whenever the candidate is infeasible or its estimated operational cost is too low.

### Automatic Cut Generation (`sub.link()`)

Return a continuous LP subproblem `Model` from `subproblem` and connect it to master variables with `sub.link(...)`. WaSHI automatically tracks the estimated subproblem cost (`theta`), plugs in the master's current values, and adds cuts until the gap converges:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

// 1. Master problem: binary facility opening decisions
const master = new Model("FacilityMaster");
const y1 = master.binary("open_F1");
const y2 = master.binary("open_F2");

// Fixed opening costs (operational cost variable theta is added automatically)
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
console.log("Open facilities:", result.values);
```

> [!NOTE]
> **Negative subproblem objectives**: By default, WaSHI creates the internal cost estimator `theta` with `lb: 0`. If your subproblem objective can be negative (for example, net profit or rebates), declare `const theta = master.continuous("theta", { lb: -1e6 })`, include `+ ${theta}` in `master.objective(...)`, and pass `{ theta }` to `solveBenders()`.

### Manual Cut Generation (`BendersCut` / Lazy Constraints)

For custom cuts or lazy constraints (such as TSP subtour elimination), return a `BendersCut` object, `BendersCut[]`, or `null` when no further cuts are needed:

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
`m.relax()` temporarily treats all `Integer` and `Binary` variables as continuous within `[lb, ub]` and solves the LP so dual values are available:

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
Add to or overwrite a variable's coefficient inside an existing linear constraint:

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
