/**
 * Example 9: Transportation & Allocation Problem (Linear Programming)
 *
 * Demonstrates:
 * - 2D indexed variable matrices via `m.addVars(factories, stores, ...)`
 * - Row and column aggregations with `sum()`
 * - Inspecting how changing a supply parameter changes the resulting flows
 *
 * Solver: HiGHS (default LP engine)
 * Run with: npx tsx examples/node/09-transportation-problem.ts
 */

import { Model, sum } from "../../src/index.js";

const factories = ["Tokyo", "Nagoya", "Osaka"] as const;
const stores = ["North", "East", "West", "South"] as const;

type Factory = (typeof factories)[number];
type Store = (typeof stores)[number];

// Unit shipping cost ($ / unit) from each factory to each store
const shippingCost: Record<Factory, Record<Store, number>> = {
  Tokyo:  { North: 4, East: 2, West: 7, South: 8 },
  Nagoya: { North: 6, East: 4, West: 3, South: 5 },
  Osaka:  { North: 9, East: 7, West: 2, South: 3 },
};

const storeDemands: Record<Store, number> = {
  North: 70,
  East: 90,
  West: 60,
  South: 60,
};

async function solveTransportation(
  label: string,
  supplies: Record<Factory, number>
) {
  console.log(`\n--- ${label} ---`);
  const t0 = performance.now();

  const m = new Model({ name: "TransportationNetwork", sense: "Minimize" });

  // 2D dictionary of continuous shipment variables: ship[factory][store] >= 0
  const ship = m.addVars(
    [...factories],
    [...stores],
    { lb: 0, prefix: "ship" }
  );

  // Objective: Minimize total shipping cost across all routes
  const costTerms = [];
  for (const f of factories) {
    for (const s of stores) {
      costTerms.push(ship[f][s].mul(shippingCost[f][s]));
    }
  }
  m.minimize(sum(costTerms));

  // Supply constraints: Outgoing shipments from each factory <= capacity
  for (const f of factories) {
    m.addConstraint(
      sum(stores.map((s) => ship[f][s])).le(supplies[f]),
      `supply_${f}`
    );
  }

  // Demand constraints: Incoming shipments to each store >= demand
  for (const s of stores) {
    m.addConstraint(
      sum(factories.map((f) => ship[f][s])).ge(storeDemands[s]),
      `demand_${s}`
    );
  }

  const buildMs = performance.now() - t0;
  const status = await m.solve();
  const solveMs = m.runTime * 1000;

  console.log(`Status: ${status} (model build: ${buildMs.toFixed(2)}ms, solve: ${solveMs.toFixed(2)}ms)`);
  console.log(`Total Shipping Cost: $${m.objectiveValue}`);

  console.log("\nOptimal Shipment Plan (units):");
  const header = "Factory \\ Store".padEnd(16) + stores.map((s) => s.padStart(8)).join("") + "  | Used / Cap";
  console.log(header);
  console.log("-".repeat(header.length));

  for (const f of factories) {
    let used = 0;
    const rowCells = stores.map((s) => {
      const val = ship[f][s].value ?? 0;
      used += val;
      return (val > 1e-6 ? val.toFixed(0) : "·").padStart(8);
    });
    console.log(
      `${f.padEnd(16)}${rowCells.join("")}  | ${String(Math.round(used)).padStart(3)} / ${supplies[f]}`
    );
  }
}

async function main() {
  console.log("=== Transportation & Distribution Network (LP) ===");

  // Scenario A: Baseline factory capacities
  await solveTransportation("Scenario A: Baseline Supply Capacities", {
    Tokyo: 120,
    Nagoya: 100,
    Osaka: 80,
  });

  // Scenario B: Tokyo capacity reduced from 120 -> 80 due to maintenance;
  // Nagoya and Osaka absorb the East/North shipments at slightly higher cost.
  await solveTransportation("Scenario B: Tokyo Capacity Constrained (120 -> 80)", {
    Tokyo: 80,
    Nagoya: 120,
    Osaka: 100,
  });
}

main().catch(console.error);
