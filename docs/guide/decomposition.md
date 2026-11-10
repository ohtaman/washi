# Advanced Decomposition Methods & Best Practices

Mixed-Integer Programming (MIP) formulations can become slow when symmetry or coupling constraints cause branch-and-bound trees to grow large.
WaSHI provides decomposition orchestrators (`master.solveColumnGeneration` and `master.solveBenders`) along with lower-level modeling primitives for dual inspection and dynamic model modification.

---

## Why Decomposition? (When Monolithic MIP Stalls)

There are two common problem structures where monolithic MIP formulations struggle:

| Problem Structure | Monolithic MIP Bottleneck | Technique | WaSHI API |
| :--- | :--- | :--- | :--- |
| **Symmetry & Loose Continuous Bounds**<br>*(Cutting Stock, Vehicle Routing/VRP, Crew Rostering)* | Symmetric permutations and a weak continuous relaxation enlarge the branch-and-bound tree. | **Column Generation**<br>*(Dantzig-Wolfe Decomposition)* | [`master.solveColumnGeneration()`](#column-generation-solvecolumngeneration) |
| **Complicating Decisions & Multi-Stage Structure**<br>*(Traveling Salesperson/TSP, Facility Location with Routing, Two-Stage Stochastic Planning)* | Coupling master decisions with large scenario or operational subproblems increases the matrix size. | **Benders Decomposition** | [`master.solveBenders()`](#benders-decomposition-solvebenders) |

---

## Foundational Primitives

WaSHI provides fine-grained modeling primitives to inspect dual information and dynamically modify models:

### 1. Constraint Duals (`dual`)
Access the dual values (marginal impact on the objective per unit change in RHS) after an LP solve:

```typescript
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual); // Dual value / shadow price
console.log(m.solution?.duals.capacity);
```

### 2. Continuous LP Relaxation (`model.relax()`)
Decomposition algorithms require solving the continuous LP relaxation to extract dual values. `model.relax()` temporarily relaxes all `Integer` and `Binary` variables to continuous variables within their bounds:

```typescript
// Solves LP relaxation and populates shadow prices in m.solution.duals
const status = await m.relax();
console.log("Theoretical dual bound:", m.objectiveValue);
```

### 3. Dynamic Column Injection (`model.addColumn()`)
Inject a new decision variable along with its objective coefficient and constraint contributions in a single call:

```typescript
const col = m.addColumn({
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
5. Finally solves the full master model as a Mixed-Integer Program (`finalizeAsMIP`, default: `true`) to obtain optimal integer solutions.

### Column Generation with the `pricing` Callback

Provide a `pricing` callback that receives constraint shadow prices (duals), solves the subproblem (using a WaSHI model or any custom algorithm), and returns new column proposals. WaSHI automatically evaluates reduced costs and injects improving columns:

```typescript
import { Model, expr, minimize, maximize } from "@ohtaman/washi";

const rollWidth = 100;
const items = [
  { id: "A", width: 45, demand: 10 },
  { id: "B", width: 36, demand: 14 },
  { id: "C", width: 16, demand: 20 },
];

// 1. Define Restricted Master Problem (RMP) with naive initial single-cut patterns
const master = new Model("CuttingStockMaster");

const pA = master.integer("init_A", { lb: 0 }); // 2 of A per roll (45*2 = 90 <= 100)
const pB = master.integer("init_B", { lb: 0 }); // 2 of B per roll (36*2 = 72 <= 100)
const pC = master.integer("init_C", { lb: 0 }); // 6 of C per roll (16*6 = 96 <= 100)

master.objective(minimize(expr`${pA} + ${pB} + ${pC}`));
const demandA = master.constraint(expr`2 * ${pA} >= 10`, "demand_A");
const demandB = master.constraint(expr`2 * ${pB} >= 14`, "demand_B");
const demandC = master.constraint(expr`6 * ${pC} >= 20`, "demand_C");

// 2. Solve with master.solveColumnGeneration()
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    // Pricing subproblem: Bounded Knapsack
    const sub = new Model("KnapsackPricing");
    const a_A = sub.integer("a_A", { lb: 0, ub: 2 });
    const a_B = sub.integer("a_B", { lb: 0, ub: 2 });
    const a_C = sub.integer("a_C", { lb: 0, ub: 6 });

    // Maximize shadow price collection
    const dualA = demandA.dual ?? 0;
    const dualB = demandB.dual ?? 0;
    const dualC = demandC.dual ?? 0;
    sub.objective(maximize(expr`${dualA} * ${a_A} + ${dualB} * ${a_B} + ${dualC} * ${a_C}`));
    sub.constraint(expr`45 * ${a_A} + 36 * ${a_B} + 16 * ${a_C} <= ${rollWidth}`);

    await sub.solve();

    // Return the generated cutting pattern
    return {
      cost: 1,
      type: "Integer",
      coefficients: {
        demand_A: Math.round(a_A.value ?? 0),
        demand_B: Math.round(a_B.value ?? 0),
        demand_C: Math.round(a_C.value ?? 0),
      },
    };
  },
});

console.log("Optimal rolls needed:", result.objectiveValue); // 14
console.log("Iterations executed:", result.iterations);
console.log("Dynamic columns added:", result.columnsAdded);
```

### Custom Pricing Algorithms (Graph / Dynamic Programming)

Because `pricing` is a standard callback returning column definitions, you can solve the subproblem using any algorithm (e.g. Dijkstra, Bellman-Ford, or custom heuristics):

```typescript
const result = await master.solveColumnGeneration({
  pricing: async ({ getDual }) => {
    // Solve subproblem with specialized custom graph algorithm
    const route = solveSpecializedShortestPath(getDual);
    if (!route) return null;

    return {
      cost: route.distance,
      type: "Integer",
      coefficients: route.visitedCustomers,
    };
  },
});
```

---

## Benders Decomposition (`solveBenders`)

Benders Decomposition partitions the problem into:
- **Master Problem**: Contains complicating variables (e.g., 0-1 facility opening decisions $y$) and an auxiliary variable $\theta \ge 0$ representing estimated subproblem costs.
- **Subproblem**: Solves operational decisions given fixed master values $y^*$, feeding back **Optimality Cuts** to the master.

### Recommended: Automated Cut Generation with `sub.link()`

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

    // Link subproblem flows with master decisions y1, y2 via linking constraints
    sub.link(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.link(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub; // Returning the model automatically generates cuts and manages theta
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
  subproblem: async () => {
    const open1 = y1.value ?? 0;
    const open2 = y2.value ?? 0;
    const estTheta = theta.value ?? 0;

    const sub = new Model("TransportSubproblem");
    // ...
    await sub.solve();

    const actualCost = sub.objectiveValue!;
    if (estTheta < actualCost - 1e-4) {
      return {
        kind: "optimality",
        constraint: expr`${theta} - 50 * ${sub.solution!.duals.cap1} * ${y1} - 60 * ${sub.solution!.duals.cap2} * ${y2} >= ${rhs}`,
        subproblemObjective: 100 * open1 + 120 * open2 + actualCost,
      };
    }
    return null; // Converged
  },
});
```

---

## Application Examples

Two common applications of decomposition methods:

### 1. 1D Bin Packing / Fleet Sizing $\times$ Column Generation (and Full CVRP)
*(For full distance-based CVRP with 2-opt tour pricing, see [Vehicle Routing Problem (CVRP)](../examples/vehicle-routing.md) and [`examples/node/13-vehicle-routing-column-generation.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts))*

* **Problem Structure**: Assigning customer orders to capacity-constrained vehicles (1D Bin Packing / Fleet Sizing) or tours produces an exponential number of feasible combinations.
* **Column Generation Formulation**:
  * **Master Problem**: Set covering model (`>= 1`) that selects the minimum number of vehicles (`cost: 1` per route) such that each customer order is covered.
  * **Pricing Subproblem**: 0-1 Knapsack model that dynamically generates a capacity-feasible batch (`column`) with negative reduced cost ($1 - \sum \pi_i a_i < 0$) based on customer dual shadow prices. (In full CVRP, the column cost is the tour distance and the pricing subproblem is an Elementary Shortest Path Problem with Resource Constraints, ESPPRC.)

```typescript
import { Model, expr, minimize, LinExpr, type Var } from "@ohtaman/washi";

const vehicleCapacity = 8;
const customers = [
  { id: "C1", demand: 4 },
  { id: "C2", demand: 3 },
  { id: "C3", demand: 5 },
  { id: "C4", demand: 2 },
  { id: "C5", demand: 4 },
];

// 1. Master Problem: Customer coverage
const master = new Model("CVRP_Master");
const initialRoutes: Var[] = [];
for (const cust of customers) {
  initialRoutes.push(master.integer(`init_${cust.id}`, { lb: 0, ub: 1 }));
}
master.objective(minimize(initialRoutes.reduce((acc, r) => acc.add(r), new LinExpr())));

const visitConstrs = customers.map((cust, i) =>
  master.constraint(expr`${initialRoutes[i]} >= 1`, `visit_${cust.id}`)
);

// 2. Solve via Column Generation
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  pricing: async () => {
    const sub = new Model("RoutePricing");
    const a: Record<string, Var> = {};
    const obj = new LinExpr();

    for (let i = 0; i < customers.length; i++) {
      const cust = customers[i];
      a[cust.id] = sub.binary(`v_${cust.id}`);
      obj.addTerm(a[cust.id], visitConstrs[i].dual ?? 0);
    }

    sub.objective(maximize(obj));

    // Capacity limit: sum(demand_i * a_i) <= vehicleCapacity
    const load = customers.reduce((acc, c) => acc.add(a[c.id].mul(c.demand)), new LinExpr());
    sub.constraint(expr`${load} <= ${vehicleCapacity}`);

    await sub.solve();

    const coefficients: Record<string, number> = {};
    for (const cust of customers) {
      coefficients[`visit_${cust.id}`] = Math.round(a[cust.id].value ?? 0);
    }

    return {
      cost: 1,
      type: "Integer",
      coefficients,
    };
  },
});

console.log("Optimal fleet size:", result.objectiveValue); // 3 vehicles
```

### 2. Traveling Salesperson Problem (TSP) $\times$ Benders Decomposition (Lazy Subtour Elimination)
*(Full executable source: [`examples/node/14-traveling-salesperson-benders.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts))*

* **Problem Structure**: Preventing isolated sub-loops (subtours) requires Subtour Elimination Constraints (SECs), which grow as $O(2^n)$ constraints for $n$ cities.
* **Benders Decomposition Formulation**:
  * **Master Problem**: Solves the relaxed assignment problem (each city has 1 incoming and 1 outgoing edge).
  * **Subproblem**: Evaluates the candidate tour graph for disconnected components. If isolated subtours exist, it lazily injects a Benders feasibility cut ($\sum_{i,j \in S} x_{ij} \le |S| - 1$) cutting off that cycle.

```typescript
import { Model, expr, minimize, LinExpr, type Var } from "@ohtaman/washi";

const n = cities.length;
const master = new Model("TSP_Master");
const x: Record<string, Var> = {};
const objExpr = new LinExpr();

for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) {
    if (i !== j) {
      const v = master.binary(`x_${i}_${j}`);
      x[`${i}_${j}`] = v;
      objExpr.addTerm(v, dist(i, j));
    }
  }
}
master.objective(minimize(objExpr));

// Degree constraints
for (let i = 0; i < n; i++) {
  const outE = new LinExpr();
  const inE = new LinExpr();
  for (let j = 0; j < n; j++) {
    if (i !== j) {
      outE.addTerm(x[`${i}_${j}`], 1);
      inE.addTerm(x[`${j}_${i}`], 1);
    }
  }
  master.constraint(expr`${outE} == 1`, `out_${i}`);
  master.constraint(expr`${inE} == 1`, `in_${i}`);
}

// Solve with Benders lazy subtour elimination
const result = await master.solveBenders({
  subproblem: () => {
    const cycles = findCycles(n, (i, j) => (x[`${i}_${j}`].value ?? 0) > 0.5);
    if (cycles.length === 1 && cycles[0].length === n) {
      return null; // Single tour covers all cities
    }

    // Subtours detected: inject a Benders feasibility cut for EVERY disconnected cycle (multi-cut separation)
    return cycles.map((S) => {
      const secExpr = new LinExpr();
      for (const i of S) {
        for (const j of S) {
          if (i !== j) secExpr.addTerm(x[`${i}_${j}`], 1);
        }
      }
      return {
        kind: "feasibility" as const,
        constraint: expr`${secExpr} <= ${S.length - 1}`,
      };
    });
  },
});
```

---

## 💡 Practical Decomposition Notes

1. **Set Covering (`>= 1`) vs. Set Partitioning (`== 1`) in Column Generation**:
   - Formulating customer coverage as `>= 1` (Set Covering) rather than `== 1` (Set Partitioning) restricts dual prices to $\pi_i \ge 0$, preventing wild positive/negative dual oscillations and significantly accelerating column generation convergence. Whenever costs obey the triangle inequality, any over-covered customer in a route can simply be skipped without increasing cost.
2. **Price-and-Branch (`finalizeAsMIP: true`) vs. Exact Branch-and-Price**:
   - Setting `finalizeAsMIP: true` solves the final Restricted Master Problem as an integer program over all columns generated during the root LP phase. In industrial OR, this is known as the **Price-and-Branch (Restricted Master Heuristic)** pattern—it is fast, simple, and typically within 0–2% of the exact Branch-and-Price optimum without requiring branching inside the pricing subproblem.
3. **Negative Subproblem Objectives in `solveBenders()` (`theta` Lower Bound)**:
   - When using automatic linking via `sub.link(...)`, WaSHI creates an auxiliary master variable `__benders_theta` with default `lb: 0` (valid when subproblem costs are non-negative). If your subproblem objective can take negative values (e.g., net profit or rebate terms), pass an explicit `theta: master.continuous("theta", { lb: -1e6 })` option with a finite negative lower bound so the initial master relaxation is not artificially clipped at `0`.
4. **Multi-Cut Separation & Equivalent DFJ Subtour Constraints**:
   - In Benders / lazy-constraint callbacks, returning an array of cuts for **all** disconnected subtours found in the current incumbent (`cycles.map(...)`) eliminates multiple invalid components per master MIP solve.
   - Because the TSP master problem enforces out-degree $\sum_{j \ne i} x_{ij} = 1$ for every $i \in S$, the internal-edge subtour elimination constraint $\sum_{i,j \in S} x_{ij} \le |S| - 1$ is algebraically identical to the cut-set constraint $\sum_{i \in S, j \notin S} x_{ij} \ge 1$.
