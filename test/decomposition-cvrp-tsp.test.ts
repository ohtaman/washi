import { describe, it, expect } from "vitest";
import { runCVRP } from "../examples/node/13-vehicle-routing-column-generation.js";
import { runTSP } from "../examples/node/14-traveling-salesperson-benders.js";

describe("OR Killer Applications (examples/node/13 and 14)", () => {
  it("executes 13-vehicle-routing-column-generation.ts successfully with tour validation", async () => {
    const result = await runCVRP();
    expect(result.status).toBe("Optimal");
    expect(result.objectiveValue).toBe(3);
    expect(result.columnsAdded).toBeGreaterThanOrEqual(1);

    const customerLocations: Record<
      string,
      { x: number; y: number; demand: number; serviceTime: number }
    > = {
      C1: { x: 20, y: 20, demand: 4, serviceTime: 30 },
      C2: { x: 25, y: -10, demand: 3, serviceTime: 25 },
      C3: { x: -20, y: 30, demand: 5, serviceTime: 40 },
      C4: { x: -15, y: -25, demand: 2, serviceTime: 20 },
      C5: { x: 30, y: 15, demand: 4, serviceTime: 35 },
    };
    const depot = { x: 0, y: 0 };
    const maxRouteTime = 180;
    const vehicleCapacity = 8;
    const maxStops = 3;

    const getCoord = (id: string) => (id === "Depot" ? depot : customerLocations[id]);
    const calcDist = (aId: string, bId: string) => {
      const a = getCoord(aId);
      const b = getCoord(bId);
      return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
    };

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
      for (const cId of Object.keys(customerLocations)) {
        const expectedCoeff = visitedCustomers.includes(cId) ? 1 : undefined;
        const actualCoeff =
          coeffs instanceof Map
            ? coeffs.get(`visit_${cId}`)
            : Array.isArray(coeffs)
              ? undefined
              : coeffs[`visit_${cId}`];
        expect(actualCoeff).toBe(expectedCoeff);
      }

      // Total demand must not exceed vehicle capacity
      const totalDemand = visitedCustomers.reduce(
        (acc, cId) => acc + customerLocations[cId].demand,
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
        (acc, cId) => acc + customerLocations[cId].serviceTime,
        0
      );
      expect(meta?.totalTime).toBe(expectedTravelTime + expectedServiceTime);
      expect(meta?.totalTime).toBeLessThanOrEqual(maxRouteTime);
    }

    // Active routes in the final MIP solution
    const activeGeneratedRoutes = result.generatedColumns.filter(
      (col) => (col.variable.value ?? 0) > 0.5
    );
    expect(activeGeneratedRoutes.length).toBe(2);

    // Verify all active generated routes are multi-stop routes
    for (const route of activeGeneratedRoutes) {
      expect(route.proposal.meta?.tour.length).toBeGreaterThan(3);
    }

    // Verify set partitioning: all 5 customers visited exactly once across active routes
    const coveredCustomers = new Set<string>();
    for (const route of activeGeneratedRoutes) {
      const meta = route.proposal.meta;
      for (const cust of meta!.tour.slice(1, -1)) {
        expect(coveredCustomers.has(cust)).toBe(false);
        coveredCustomers.add(cust);
      }
    }

    // The remaining customer (C3) is served by the dedicated initial round-trip route
    for (const cId of Object.keys(customerLocations)) {
      if ((result.values[`route_init_${cId}`] ?? 0) > 0.5) {
        expect(coveredCustomers.has(cId)).toBe(false);
        coveredCustomers.add(cId);
      }
    }
    expect(coveredCustomers.size).toBe(5);
  });

  it("executes 14-traveling-salesperson-benders.ts successfully", async () => {
    const result = await runTSP();
    expect(result.status).toBe("Optimal");
    expect(result.objectiveValue).toBeCloseTo(7.236, 1e-2);
    expect(result.cutsAdded).toBeGreaterThanOrEqual(1);
  });
});
