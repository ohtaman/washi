import { describe, it, expect } from "vitest";
import { runCVRP } from "../examples/node/13-vehicle-routing-column-generation.js";
import { runTSP } from "../examples/node/14-traveling-salesperson-benders.js";

describe("OR Killer Applications (examples/node/13 and 14)", () => {
  it("executes 13-vehicle-routing-column-generation.ts successfully with tour validation (50 customers)", async () => {
    const result = await runCVRP();
    expect(result.status).toBe("Optimal");
    expect(Math.round(result.objectiveValue ?? 0)).toBe(19);
    expect(result.columnsAdded).toBeGreaterThanOrEqual(10);

    const depot = { id: "Depot", x: 0, y: 0 };
    const customers = Array.from({ length: 50 }, (_, i) => {
      const angle = i * 2.4;
      const radius = 15 + (i % 5) * 8;
      return {
        id: `C${i + 1}`,
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius),
        demand: 1 + (i % 4),
        serviceTime: 10,
      };
    });

    const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]));
    const nodes = Object.fromEntries([depot, ...customers].map((n) => [n.id, n]));
    const calcDist = (aId: string, bId: string) => {
      const a = nodes[aId];
      const b = nodes[bId];
      return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
    };

    const maxRouteTime = 200;
    const vehicleCapacity = 10;
    const maxStops = 4;

    expect(result.generatedColumns.length).toBeGreaterThan(0);

    for (const col of result.generatedColumns) {
      const meta = col.proposal.meta;
      expect(meta).toBeDefined();
      expect(meta?.tour.length).toBeGreaterThanOrEqual(3);
      expect(meta?.tour[0]).toBe("Depot");
      expect(meta?.tour[meta.tour.length - 1]).toBe("Depot");

      const visitedCustomers = meta!.tour.slice(1, -1);
      // No duplicate customer visits in a single route
      expect(new Set(visitedCustomers).size).toBe(visitedCustomers.length);
      // Maximum stops constraint
      expect(visitedCustomers.length).toBeLessThanOrEqual(maxStops);

      // Verify that coverage coefficients match visited customers exactly
      const coeffs = col.proposal.coefficients;
      for (const c of customers) {
        const expectedCoeff = visitedCustomers.includes(c.id) ? 1 : undefined;
        const actualCoeff =
          coeffs instanceof Map
            ? coeffs.get(`visit_${c.id}`)
            : Array.isArray(coeffs)
              ? undefined
              : coeffs[`visit_${c.id}`];
        expect(actualCoeff).toBe(expectedCoeff);
      }

      // Total demand must not exceed vehicle capacity
      const totalDemand = visitedCustomers.reduce(
        (acc, cId) => acc + customerMap[cId].demand,
        0
      );
      expect(totalDemand).toBeLessThanOrEqual(vehicleCapacity);

      // Independently verify travel time along the tour path
      let expectedTravelTime = 0;
      for (let i = 0; i < meta!.tour.length - 1; i++) {
        expectedTravelTime += calcDist(meta!.tour[i], meta!.tour[i + 1]);
      }
      expect(meta?.travelTime).toBe(expectedTravelTime);

      // Independently verify total duration (travel time + service time)
      const expectedServiceTime = visitedCustomers.reduce(
        (acc, cId) => acc + customerMap[cId].serviceTime,
        0
      );
      expect(meta?.totalTime).toBe(expectedTravelTime + expectedServiceTime);
      expect(meta?.totalTime).toBeLessThanOrEqual(maxRouteTime);
    }

    // Active routes in the final MIP solution
    const activeGeneratedRoutes = result.generatedColumns.filter(
      (col) => (col.variable.value ?? 0) > 0.5
    );
    expect(activeGeneratedRoutes.length).toBeGreaterThan(0);

    // Verify set partitioning: all 50 customers visited exactly once across active routes
    const coveredCustomers = new Set<string>();
    for (const route of activeGeneratedRoutes) {
      const meta = route.proposal.meta;
      for (const cust of meta!.tour.slice(1, -1)) {
        expect(coveredCustomers.has(cust)).toBe(false);
        coveredCustomers.add(cust);
      }
    }

    // Remaining customers are served by initial dedicated round trips
    for (const c of customers) {
      if ((result.values[`route_init_${c.id}`] ?? 0) > 0.5) {
        expect(coveredCustomers.has(c.id)).toBe(false);
        coveredCustomers.add(c.id);
      }
    }
    expect(coveredCustomers.size).toBe(50);
  });

  it("executes 14-traveling-salesperson-benders.ts successfully", async () => {
    const result = await runTSP();
    expect(result.status).toBe("Optimal");
    expect(result.objectiveValue).toBeCloseTo(7.236, 1e-2);
    expect(result.cutsAdded).toBeGreaterThanOrEqual(1);
  });
});
