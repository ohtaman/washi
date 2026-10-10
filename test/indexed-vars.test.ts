import { describe, it, expect } from "vitest";
import { Model, sum } from "../src/index.js";

describe("Indexed Multi-dimensional Variables (addVars)", () => {
  it("creates a 1D record of variables from an array of string keys", () => {
    const m = new Model("FacilityLocation");
    const cities = ["Tokyo", "Osaka", "Nagoya"];

    const x = m.addVars(cities, { lb: 0, ub: 1, type: "Binary", prefix: "open" });

    expect(x["Tokyo"]).toBeDefined();
    expect(x["Osaka"]).toBeDefined();
    expect(x["Nagoya"]).toBeDefined();
    expect(x["Tokyo"].name).toBe("open_Tokyo");
    expect(x["Tokyo"].type).toBe("Binary");
  });

  it("creates a 2D nested record of variables from two index sets", () => {
    const m = new Model("Transportation");
    const factories = ["F1", "F2"];
    const stores = ["S1", "S2", "S3"];

    const ship = m.addVars(factories, stores, { lb: 0, type: "Continuous", prefix: "ship" });

    expect(ship["F1"]["S1"]).toBeDefined();
    expect(ship["F1"]["S3"]).toBeDefined();
    expect(ship["F2"]["S2"]).toBeDefined();
    expect(ship["F1"]["S1"].name).toBe("ship_F1_S1");
  });

  it("creates a 2D grid from integer dimensions (e.g. 8x8 chessboard)", () => {
    const m = new Model("NQueens");

    const board = m.addVars(8, 8, { type: "Binary", prefix: "queen" });

    expect(board[0][0]).toBeDefined();
    expect(board[7][7]).toBeDefined();
    expect(board[0][0].name).toBe("queen_0_0");
    expect(board[3][4].type).toBe("Binary");
  });

  it("solves an assignment problem formulated cleanly with addVars", async () => {
    const m = new Model("WorkerTaskAssignment");
    const workers = ["Alice", "Bob", "Charlie"];
    const tasks = ["Task1", "Task2", "Task3"];

    // Cost matrix: cost[worker][task]
    const cost: Record<string, Record<string, number>> = {
      Alice: { Task1: 9, Task2: 2, Task3: 7 },
      Bob: { Task1: 6, Task2: 4, Task3: 3 },
      Charlie: { Task1: 5, Task2: 8, Task3: 1 },
    };

    // x[worker][task] = 1 if worker assigned to task
    const x = m.addVars(workers, tasks, { type: "Binary" });

    // Each worker assigned to exactly 1 task
    for (const w of workers) {
      m.addConstraint(sum(tasks.map((t) => x[w][t])).eq(1), `worker_${w}`);
    }

    // Each task assigned to exactly 1 worker
    for (const t of tasks) {
      m.addConstraint(sum(workers.map((w) => x[w][t])).eq(1), `task_${t}`);
    }

    // Objective: Minimize total cost
    const totalCost = sum(
      workers.flatMap((w) => tasks.map((t) => x[w][t].mul(cost[w][t])))
    );
    m.minimize(totalCost);

    const status = await m.solve();

    expect(status).toBe("Optimal");
    // Alice -> Task2 (cost 2)
    // Bob -> Task1 (cost 6)
    // Charlie -> Task3 (cost 1)
    // Total cost = 2 + 6 + 1 = 9
    expect(m.objectiveValue).toBe(9);
    expect(x["Alice"]["Task2"].value).toBe(1);
    expect(x["Bob"]["Task1"].value).toBe(1);
    expect(x["Charlie"]["Task3"].value).toBe(1);
  });
});
