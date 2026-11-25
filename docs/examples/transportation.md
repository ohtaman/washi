# Transportation & Allocation Network (LP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Linear Programming (LP) | HiGHS (default) | `m.continuous()`, `m.constraint()`, `expr` (`sum`, `dot`), `minimize`, `constr.dual` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=transportation">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts">Source Code</a></li></ul> |

The **transportation problem** decides how many units to ship from each factory to each store. The goal is to minimize total shipping cost while respecting factory supply limits and meeting every store's demand.

This example builds a 2D decision-variable matrix with `m.continuous(factories, stores)`, writes the total cost objective with `dot()`, and expresses the row and column supply/demand constraints with `sum()` and ``m.constraint(expr`...`)``.

## Problem Inputs

Three factories (`Tokyo`, `Nagoya`, `Osaka`) ship to four regional stores: `North`, `East`, `West`, and `South`.

| Factory / Store | North ($/unit) | East ($/unit) | West ($/unit) | South ($/unit) | Supply Capacity |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Tokyo** | $4 | $2 | $7 | $8 | **120** units |
| **Nagoya** | $6 | $4 | $3 | $5 | **100** units |
| **Osaka** | $9 | $7 | $2 | $3 | **80** units |
| **Store Demand** | **70** units | **90** units | **60** units | **60** units | Demand 280 / Supply 300 |

## Mathematical Formulation

Let $F$ be the set of factories, $S$ be the set of stores, $\text{Supply}_f$ be factory $f$'s supply capacity, $\text{Demand}_s$ be store $s$'s demand, $x_{f, s} \ge 0$ be the quantity shipped from $f \in F$ to $s \in S$, and $c_{f, s}$ be the unit shipping cost.

$$\begin{aligned}
\text{Minimize} \quad & \sum_{f \in F} \sum_{s \in S} c_{f,s} \, x_{f,s} \\
\text{Subject to} \quad & \sum_{s \in S} x_{f,s} \le \text{Supply}_f \quad \forall f \in F \quad (\text{Factory capacity}) \\
& \sum_{f \in F} x_{f,s} \ge \text{Demand}_s \quad \forall s \in S \quad (\text{Store demand}) \\
& x_{f,s} \ge 0 \quad \forall f \in F, s \in S
\end{aligned}$$

## Implementation in WaSHI

<CodeRunner preset="transportation">

```typescript
import { Model, minimize, expr } from "@ohtaman/washi";

const factories = ["Tokyo", "Nagoya", "Osaka"] as const;
const stores = ["North", "East", "West", "South"] as const;

const shippingCost = {
  Tokyo:  { North: 4, East: 2, West: 7, South: 8 },
  Nagoya: { North: 6, East: 4, West: 3, South: 5 },
  Osaka:  { North: 9, East: 7, West: 2, South: 3 },
};

const supplies = { Tokyo: 120, Nagoya: 100, Osaka: 80 };
const demands = { North: 70, East: 90, West: 60, South: 60 };

async function solveScenario(label: string, cap: typeof supplies) {
  const m = new Model("TransportationNetwork");

  // 1. Create 2D continuous variables: ship[factory][store] >= 0
  const ship = m.continuous([...factories], [...stores], { lb: 0 });

  // 2. Objective: Minimize total shipping cost across all routes via 2D dot product
  m.objective(minimize(expr`dot(${shippingCost}, ${ship})`));

  // 3. Supply constraints (row sums): outgoing from f <= cap[f]
  const supplyConstrs = Object.fromEntries(
    factories.map((f) => [
      f,
      m.constraint(expr`sum(${ship[f]}) <= ${cap[f]}`, `supply_${f}`),
    ])
  );

  // 4. Demand constraints (column sums): incoming to s >= demands[s]
  const demandConstrs = Object.fromEntries(
    stores.map((s) => [
      s,
      m.constraint(
        expr`sum(${factories}, ${(f) => ship[f][s]}) >= ${demands[s]}`,
        `demand_${s}`
      ),
    ])
  );

  const status = await m.solve();
  console.log(`[${label}] Status: ${status}, Total Shipping Cost: $${m.objectiveValue}`);
  for (const f of factories) {
    const dual = supplyConstrs[f].dual ?? 0;
    const routes = stores
      .map((s) => `${s}:${Math.round(ship[f][s].value ?? 0)}`)
      .join(", ");
    console.log(`  ${f.padEnd(7)} -> ${routes} (supply dual: $${dual}/u)`);
  }
  const demandDuals = stores
    .map((s) => `${s}:$${demandConstrs[s].dual ?? 0}`)
    .join(", ");
  console.log(`  Marginal Delivered Cost (demand duals) -> ${demandDuals}`);
}

async function runTransportation() {
  // Scenario A: Baseline capacities (Optimal: $880)
  await solveScenario("Scenario A: Baseline", supplies);

  // Scenario B: Tokyo reduced (120 -> 80); Nagoya (100 -> 120) & Osaka (80 -> 100) expanded (Optimal: $940)
  await solveScenario("Scenario B: Tokyo Maintenance", {
    Tokyo: 80,
    Nagoya: 120,
    Osaka: 100,
  });
}

runTransportation();
```

</CodeRunner>

## Practical Notes

### Supply & Demand Shadow Prices (`.dual`)

In a minimization LP, each constraint's **shadow price** (`.dual`) measures how much total cost changes when its right-hand side increases by 1 unit:

- **`demand_s.dual` ($\ge 0$):** Marginal delivered cost of supplying 1 extra unit to store $s$.
- **`supply_f.dual` ($\le 0$):** Marginal change in total shipping cost when factory $f$'s capacity increases by 1 unit (a negative value indicates cost savings).

Scenario A reaches an optimal cost of `$880`, and Scenario B reaches `$940`. In both scenarios, `Tokyo` is already at full capacity with `supply_Tokyo.dual = -$2/unit`. Each extra unit of capacity in Tokyo saves `$2` by replacing more expensive shipments from Nagoya. `Osaka` is also at its supply limit with a shadow price of `-$1/unit`.

### Handling Supply Shortages

Hard demand constraints require total supply capacity to cover total demand ($\sum_{f \in F} \text{Supply}_f \ge \sum_{s \in S} \text{Demand}_s$). If total demand exceeds total factory capacity, HiGHS returns `"Infeasible"`.

To avoid hard failures during shortages, add a non-negative spot-carrier or backorder variable $u_s \ge 0$ to each store's demand constraint ($\sum_{f \in F} x_{f,s} + u_s \ge \text{Demand}_s$) and add a high penalty cost for $u_s$ to the objective. This lets the solver allocate scarce supply capacity optimally across stores.
