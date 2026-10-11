# Transportation & Allocation Network (LP)

**Problem Class:** Linear Programming (LP) · **Solver:** HiGHS (default) · **APIs:** `m.addVars(rows, cols)`, `sum()`, `constr.dual`  
**[▶ Open in Interactive Playground](https://ohtaman.github.io/washi/demo/?preset=transportation)** · **Source:** [`examples/node/09-transportation-problem.ts`](https://github.com/ohtaman/washi/blob/main/examples/node/09-transportation-problem.ts)

The transportation problem is one of the most fundamental network optimization models: determine how many units to ship from each supply origin (factory) to each destination (store) to minimize total shipping cost while respecting factory supply limits and meeting store demands.

This example demonstrates how to construct a **2D matrix of decision variables** using `m.addVars(factories, stores)` and aggregate across rows and columns using `sum()`.

---

## Problem Inputs

We have **3 factories** (`Tokyo`, `Nagoya`, `Osaka`) shipping to **4 regional stores** (`North`, `East`, `West`, `South`):

| Factory \ Store | North ($/unit) | East ($/unit) | West ($/unit) | South ($/unit) | Supply Capacity |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Tokyo** | $4 | $2 | $7 | $8 | **120** units |
| **Nagoya** | $6 | $4 | $3 | $5 | **100** units |
| **Osaka** | $9 | $7 | $2 | $3 | **80** units |
| **Store Demand** | **70** units | **90** units | **60** units | **60** units | Total: 280 / 300 |

---

## Mathematical Formulation

Let $x_{f, s} \ge 0$ be the quantity shipped from factory $f \in F$ to store $s \in S$, and $c_{f, s}$ be the unit shipping cost.

$$\begin{aligned}
\text{Minimize} \quad & \sum_{f \in F} \sum_{s \in S} c_{f,s} \, x_{f,s} \\
\text{Subject to} \quad & \sum_{s \in S} x_{f,s} \le \text{Supply}_f \quad \forall f \in F \quad (\text{Factory capacity}) \\
& \sum_{f \in F} x_{f,s} \ge \text{Demand}_s \quad \forall s \in S \quad (\text{Store demand}) \\
& x_{f,s} \ge 0 \quad \forall f \in F, s \in S
\end{aligned}$$

---

## Implementation in WaSHI

```typescript
import { Model, sum } from "@ohtaman/washi";

const factories = ["Tokyo", "Nagoya", "Osaka"] as const;
const stores = ["North", "East", "West", "South"] as const;

const shippingCost = {
  Tokyo:  { North: 4, East: 2, West: 7, South: 8 },
  Nagoya: { North: 6, East: 4, West: 3, South: 5 },
  Osaka:  { North: 9, East: 7, West: 2, South: 3 },
};

const supplies = { Tokyo: 120, Nagoya: 100, Osaka: 80 };
const demands = { North: 70, East: 90, West: 60, South: 60 };

async function runTransportation() {
  const m = new Model({ name: "TransportationNetwork", sense: "Minimize" });

  // 1. Create a 2D variable dictionary: ship[factory][store] >= 0
  const ship = m.addVars([...factories], [...stores], { lb: 0, prefix: "ship" });

  // 2. Objective: Minimize total shipping cost across all routes
  const costTerms = [];
  for (const f of factories) {
    for (const s of stores) {
      costTerms.push(ship[f][s].mul(shippingCost[f][s]));
    }
  }
  m.minimize(sum(costTerms));

  // 3. Supply constraints (row sums): outgoing from f <= supplies[f]
  for (const f of factories) {
    m.addConstraint(
      sum(stores.map((s) => ship[f][s])).le(supplies[f]),
      `supply_${f}`
    );
  }

  // 4. Demand constraints (column sums): incoming to s >= demands[s]
  for (const s of stores) {
    m.addConstraint(
      sum(factories.map((f) => ship[f][s])).ge(demands[s]),
      `demand_${s}`
    );
  }

  const status = await m.solve();
  console.log(`Status: ${status}, Total Cost: $${m.objectiveValue}`);
}

runTransportation();
```

---

## Expected Output & Parameter Sensitivity

Running `npx tsx examples/node/09-transportation-problem.ts` compares the baseline capacity scenario against a constrained scenario where Tokyo's capacity drops from `120` to `80`:

```text
--- Scenario A: Baseline Supply Capacities ---
Status: Optimal (model build: 0.76ms, solve: 23.80ms)
Total Shipping Cost: $880

Optimal Shipment Plan (units):
Factory \ Store    North    East    West   South  | Used / Cap
--------------------------------------------------------------
Tokyo                 30      90       ·       ·  | 120 / 120
Nagoya                40       ·      40       ·  |  80 / 100
Osaka                  ·       ·      20      60  |  80 / 80

--- Scenario B: Tokyo Capacity Constrained (120 -> 80) ---
Status: Optimal (model build: 0.15ms, solve: 0.87ms)
Total Shipping Cost: $940

Optimal Shipment Plan (units):
Factory \ Store    North    East    West   South  | Used / Cap
--------------------------------------------------------------
Tokyo                  ·      80       ·       ·  |  80 / 80
Nagoya                70      10      20       ·  | 100 / 120
Osaka                  ·       ·      40      60  | 100 / 100
```
