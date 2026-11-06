# Advanced Decomposition Methods & Best Practices

Mixed-Integer Programming (MIP) is exceptionally versatile, but monolithic formulations suffer from well-known structural bottlenecks where standard branch-and-bound solvers slow down exponentially or stall.
WaSHI provides first-class decomposition orchestrators (`master.solveColumnGeneration` and `master.solveBenders`) along with fine-grained modeling primitives to make Operations Research (OR) best practices accessible by simply returning subproblem models.

---

## Why Decomposition? (When Monolithic MIP Stalls)

There are two primary problem structures where naive MIP formulations struggle:

| Problem Structure | Why Monolithic MIP Fails | Best Practice Technique | WaSHI API |
| :--- | :--- | :--- | :--- |
| **Massive Symmetry & Loose Continuous Bounds**<br>*(Cutting Stock, Vehicle Routing/VRP, Crew Rostering)* | Millions of symmetric permutations and a very weak continuous relaxation cause branch-and-bound exploration trees to explode. | **Column Generation**<br>*(Dantzig-Wolfe Decomposition)* | [`master.solveColumnGeneration()`](#column-generation-solvecolumngeneration) |
| **Complicating Decisions & Multi-Stage Stages**<br>*(Traveling Salesperson/TSP, Facility Location with Routing, Two-Stage Stochastic Planning)* | Coupling design/master choices with extensive scenario or operational subproblems creates an intractable matrix size. | **Benders Decomposition** | [`master.solveBenders()`](#benders-decomposition-solvebenders) |

---

## Foundational Primitives

WaSHI provides fine-grained modeling primitives to inspect dual information and dynamically modify models:

### 1. Constraint Duals (`dual`)
Access the dual values (marginal impact on the objective per unit change in RHS) after an LP solve:

```typescript
const c = m.constraint(expr`${x} + ${y} <= 10`, "capacity");
await m.solve();

console.log(c.dual); // Dual value / shadow price
console.log(m.solution.duals.capacity);
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

### Recommended: Automated Column Generation with `sub.linkColumn()`

Simply return a subproblem `Model` from your callback and declare variable-to-constraint bindings using `sub.linkColumn(...)`. WaSHI automatically sets the dual pricing objective, verifies reduced costs, and injects columns:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

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

// Add simple initial single-cut patterns (or define using standard variables)
master.addColumn({ cost: 1, type: "Integer", coefficients: { demand_A: 2 } });
master.addColumn({ cost: 1, type: "Integer", coefficients: { demand_B: 2 } });
master.addColumn({ cost: 1, type: "Integer", coefficients: { demand_C: 6 } });

// 2. Solve automatically with master.solveColumnGeneration() (just return sub!)
const result = await master.solveColumnGeneration({
  subproblem: () => {
    // Pricing subproblem (knapsack model)
    const sub = new Model("KnapsackPricing");
    const a = {
      A: sub.integer("a_A", { lb: 0, ub: 2 }),
      B: sub.integer("a_B", { lb: 0, ub: 2 }),
      C: sub.integer("a_C", { lb: 0, ub: 6 }),
    };
    sub.constraint(expr`45 * ${a.A} + 36 * ${a.B} + 16 * ${a.C} <= ${rollWidth}`);

    // Link subproblem variables to master constraint coefficients
    sub.linkColumn({
      cost: 1,
      coefficients: {
        demand_A: a.A,
        demand_B: a.B,
        demand_C: a.C,
      },
    });

    return sub; // Returning the model automatically handles dual objectives and column injection!
  },
});

console.log("Optimal rolls needed:", result.objectiveValue); // 14
console.log("Iterations executed:", result.iterations);
console.log("Dynamic columns added:", result.columnsAdded);
```

> **Note**: For static subproblem models, you can also pass a declarative object: `subproblem: { model: sub, mapping: { demand_A: a.A, ... }, cost: 1 }`.

### Low-Level Control: Custom `pricing` Callback

For specialized subproblem solvers (e.g., shortest path algorithms on networks), you can supply a manual `pricing` callback:

```typescript
const result = await master.solveColumnGeneration({
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

### Recommended: Automated Cut Generation with `sub.linkRow()`

Return the subproblem `Model` from your callback and register linking constraints with `sub.linkRow(...)`. WaSHI automatically manages $\theta$, evaluates master candidate values, extracts duals, and injects Benders optimality cuts:

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

    // Link subproblem flows with master decisions y1, y2 via row links
    sub.linkRow(expr`${x11} + ${x12} + ${x13} <= 50 * ${y1}`);
    sub.linkRow(expr`${x21} + ${x22} + ${x23} <= 60 * ${y2}`);

    return sub; // Returning the model automatically generates cuts and manages theta!
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

## Practical Killer Applications in OR

Two celebrated canonical use cases where decomposition algorithms shine in production:

### 1. Vehicle Routing Problem (CVRP) $\times$ Column Generation
*(Full executable source: [`examples/node/13-vehicle-routing-column-generation.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/13-vehicle-routing-column-generation.ts))*

* **Challenge**: When scheduling a fleet of vehicles to visit customers, enumerating every combination of tours results in millions of variables, causing monolithic MIPs to run out of memory.
* **Column Generation Approach**:
  * **Master Problem**: Set covering model that selects the minimum number of vehicle routes such that each customer is served.
  * **Pricing Subproblem**: Knapsack model that dynamically generates one capacity-feasible route (column) with negative reduced cost based on customer dual shadow prices.

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

for (let i = 0; i < customers.length; i++) {
  master.constraint(expr`${initialRoutes[i]} >= 1`, `visit_${customers[i].id}`);
}

// 2. Solve via Column Generation
const result = await master.solveColumnGeneration({
  finalizeAsMIP: true,
  subproblem: () => {
    const sub = new Model("RoutePricing");
    const a: Record<string, Var> = {};
    for (const cust of customers) {
      a[cust.id] = sub.binary(`v_${cust.id}`);
    }

    // Capacity limit: sum(demand_i * a_i) <= vehicleCapacity
    const load = customers.reduce((acc, c) => acc.add(a[c.id].mul(c.demand)), new LinExpr());
    sub.constraint(expr`${load} <= ${vehicleCapacity}`);

    // Link generated column to master coverage constraints
    const coefficients: Record<string, Var> = {};
    for (const cust of customers) {
      coefficients[`visit_${cust.id}`] = a[cust.id];
    }
    sub.linkColumn({ cost: 1, coefficients });
    return sub;
  },
});

console.log("Optimal fleet size:", result.objectiveValue); // 3 vehicles
```

### 2. Traveling Salesperson Problem (TSP) $\times$ Benders Decomposition (Lazy Subtour Elimination)
*(Full executable source: [`examples/node/14-traveling-salesperson-benders.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/14-traveling-salesperson-benders.ts))*

* **Challenge**: Preventing isolated sub-loops (subtours) requires Subtour Elimination Constraints (SECs), which grow to **$O(2^n)$ constraints** for $n$ cities.
* **Benders Decomposition Approach**:
  * **Master Problem**: Solves the relaxed assignment problem (each city has 1 incoming and 1 outgoing edge).
  * **Subproblem**: Evaluates the candidate tour graph for disconnected components. If isolated subtours exist, it lazily injects a Benders feasibility cut ($\sum_{i,j \in S} x_{ij} \le |S| - 1$) cutting off that specific cycle.

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
  subproblem: ({ getMasterValue }) => {
    const cycles = findCycles(n, (i, j) => getMasterValue(x[`${i}_${j}`]) > 0.5);
    if (cycles.length === 1 && cycles[0].length === n) {
      return null; // Tour is complete and optimal!
    }

    // Subtour detected: inject Benders feasibility cut for smallest cycle
    const S = cycles.reduce((min, c) => (c.length < min.length ? c : min), cycles[0]);
    const secExpr = new LinExpr();
    for (const i of S) {
      for (const j of S) {
        if (i !== j) secExpr.addTerm(x[`${i}_${j}`], 1);
      }
    }
    return {
      kind: "feasibility",
      constraint: expr`${secExpr} <= ${S.length - 1}`,
    };
  },
});
```
