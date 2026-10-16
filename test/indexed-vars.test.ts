import { describe, it, expect } from "vitest";
import { Model, Var, sum, type KeyCollection } from "../src/index.js";

describe("Indexed Multi-dimensional Variables (binary / continuous)", () => {
  it("creates a 1D record of variables from an array of string keys", () => {
    const m = new Model("FacilityLocation");
    const cities = ["Tokyo", "Osaka", "Nagoya"];

    const x = m.binary(cities, { prefix: "open" });

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

    const ship = m.continuous(factories, stores, { lb: 0, prefix: "ship" });

    expect(ship["F1"]["S1"]).toBeDefined();
    expect(ship["F1"]["S3"]).toBeDefined();
    expect(ship["F2"]["S2"]).toBeDefined();
    expect(ship["F1"]["S1"].name).toBe("ship_F1_S1");
  });

  it("creates a 2D Array grid from integer dimensions (e.g. 8x8 chessboard)", () => {
    const m = new Model("NQueens");

    const board = m.binary(8, 8, { prefix: "queen" });
    const intGrid = m.integer(2, 3, { lb: 0, ub: 5, prefix: "slot" });
    const contGrid = m.continuous(2, 2, { lb: 0, prefix: "flow" });
    const boolGrid = m.bool(2, 3, { prefix: "cell" });

    expect(Array.isArray(board)).toBe(true);
    expect(Array.isArray(board[0])).toBe(true);
    expect(board.length).toBe(8);
    expect(board[0].length).toBe(8);
    expect(board[0][0]).toBeDefined();
    expect(board[7][7]).toBeDefined();
    expect(board[0][0].name).toBe("queen_0_0");
    expect(board[3][4].type).toBe("Binary");

    expect(Array.isArray(intGrid)).toBe(true);
    expect(Array.isArray(intGrid[1])).toBe(true);
    expect(intGrid.length).toBe(2);
    expect(intGrid[0].length).toBe(3);

    expect(Array.isArray(contGrid)).toBe(true);
    expect(Array.isArray(contGrid[0])).toBe(true);

    expect(Array.isArray(boolGrid)).toBe(true);
    expect(Array.isArray(boolGrid[0])).toBe(true);
    expect(boolGrid.length).toBe(2);
    expect(boolGrid[0].length).toBe(3);
  });

  it("supports mixed 2D dimensions (count x keys, keys x count) and explicit numeric key arrays", () => {
    const m = new Model("MixedDimensions");
    const shifts = ["Morning", "Night"] as const;
    const workers = ["Alice", "Bob"] as const;

    // count x keys -> Array<Record<C, Var>>
    const byDayAndShift = m.binary(3, shifts, { prefix: "ds" });
    expect(Array.isArray(byDayAndShift)).toBe(true);
    expect(byDayAndShift.length).toBe(3);
    expect(Array.isArray(byDayAndShift[0])).toBe(false);
    expect(byDayAndShift[0].Morning.name).toBe("ds_0_Morning");
    expect(byDayAndShift[2].Night.name).toBe("ds_2_Night");

    // keys x count -> Record<R, Var[]>
    const byWorkerAndDay = m.continuous(workers, 4, { lb: 0, prefix: "wd" });
    expect(Array.isArray(byWorkerAndDay)).toBe(false);
    expect(Array.isArray(byWorkerAndDay.Alice)).toBe(true);
    expect(byWorkerAndDay.Alice.length).toBe(4);
    expect(byWorkerAndDay.Alice[0].name).toBe("wd_Alice_0");
    expect(byWorkerAndDay.Bob[3].name).toBe("wd_Bob_3");

    // Bool mixed 2D
    const boolCountKeys = m.bool(2, shifts, { prefix: "bck" });
    const boolKeysCount = m.bool(workers, 2, { prefix: "bkc" });
    expect(Array.isArray(boolCountKeys)).toBe(true);
    expect(Array.isArray(boolCountKeys[0])).toBe(false);
    expect(Array.isArray(boolKeysCount)).toBe(false);
    expect(Array.isArray(boolKeysCount.Alice)).toBe(true);

    // Explicit numeric key domains produce Records, not dense 0-indexed Arrays
    const sparse1D = m.integer([10, 20], { prefix: "node" });
    expect(Array.isArray(sparse1D)).toBe(false);
    expect(sparse1D[10].name).toBe("node_10");
    expect(sparse1D[20].name).toBe("node_20");

    const sparse2D = m.continuous([10, 20], [100, 200], { prefix: "arc" });
    expect(Array.isArray(sparse2D)).toBe(false);
    expect(Array.isArray(sparse2D[10])).toBe(false);
    expect(sparse2D[10][100].name).toBe("arc_10_100");
    expect(sparse2D[20][200].name).toBe("arc_20_200");
  });

  it("preserves declared container shapes and leaf types in m.getValues()", async () => {
    const m = new Model("GetValuesShapes");
    const grid = m.integer(2, 2, { lb: 0, ub: 10, prefix: "g" });
    const countKeys = m.continuous(2, ["A", "B"] as const, { lb: 0, prefix: "ck" });
    const keysCount = m.binary(["R1", "R2"] as const, 2, { prefix: "kc" });

    // Before solve: preserves shapes with null leaves
    const unsolvedGrid = m.getValues(grid);
    expect(Array.isArray(unsolvedGrid)).toBe(true);
    expect(Array.isArray(unsolvedGrid[0])).toBe(true);
    expect(unsolvedGrid).toEqual([
      [null, null],
      [null, null],
    ]);

    const unsolvedCK = m.getValues(countKeys);
    expect(Array.isArray(unsolvedCK)).toBe(true);
    expect(Array.isArray(unsolvedCK[0])).toBe(false);
    expect(unsolvedCK).toEqual([
      { A: null, B: null },
      { A: null, B: null },
    ]);

    const unsolvedKC = m.getValues(keysCount);
    expect(Array.isArray(unsolvedKC)).toBe(false);
    expect(Array.isArray(unsolvedKC.R1)).toBe(true);
    expect(unsolvedKC).toEqual({
      R1: [null, null],
      R2: [null, null],
    });

    grid[0][0].value = 1;
    grid[0][1].value = 2;
    grid[1][0].value = 3;
    grid[1][1].value = 4;
    countKeys[0].A.value = 1.5;
    countKeys[0].B.value = 2.5;
    countKeys[1].A.value = 3.5;
    countKeys[1].B.value = 4.5;
    keysCount.R1[0].value = 1;
    keysCount.R1[1].value = 0;
    keysCount.R2[0].value = 0;
    keysCount.R2[1].value = 1;

    expect(m.getValues(grid)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(m.getValues(countKeys)).toEqual([
      { A: 1.5, B: 2.5 },
      { A: 3.5, B: 4.5 },
    ]);
    expect(m.getValues(keysCount)).toEqual({
      R1: [1, 0],
      R2: [0, 1],
    });

    // Primitive strings are excluded from KeyCollection<K> at compile time and rejected as 2nd dimension at runtime
    expect(() => {
      // @ts-expect-error primitive string is not a valid 2nd dimension KeyCollection
      m.binary(2, "AB");
    }).toThrow(/Invalid arguments provided for binary variable creation/);
    expect(() => {
      // @ts-expect-error primitive string is not a valid 1st dimension KeyCollection with numeric 2nd dimension
      m.binary("AB", 2);
    }).toThrow(/Invalid arguments provided for binary variable creation/);
    expect(() => {
      // @ts-expect-error primitive string is not a valid 2nd dimension KeyCollection
      m.bool(2, "AB");
    }).toThrow(/Invalid arguments provided for boolean variable creation/);
    expect(() => {
      // @ts-expect-error primitive string is not a valid 1st dimension KeyCollection with numeric 2nd dimension
      m.bool("AB", 2);
    }).toThrow(/Invalid arguments provided for boolean variable creation/);

    // Boxed String objects (new String("AB")) are also excluded from KeyCollection<K> at compile time and runtime
    const boxed = new String("AB");
    if (false as boolean) {
      // @ts-expect-error boxed String is not assignable to KeyCollection<string>
      const _badAlias: KeyCollection<string> = new String("AB");
    }
    expect(() => {
      // @ts-expect-error boxed String is not a valid KeyCollection
      m.binary(boxed);
    }).toThrow(/Invalid arguments provided for binary variable creation/);
    expect(() => {
      // @ts-expect-error boxed String is not a valid 2nd dimension KeyCollection
      m.binary(2, boxed);
    }).toThrow(/Invalid arguments provided for binary variable creation/);
    expect(() => {
      // @ts-expect-error boxed String is not a valid KeyCollection
      m.bool(boxed);
    }).toThrow(/Invalid arguments provided for boolean variable creation/);
    expect(() => {
      // @ts-expect-error boxed String is not a valid 2nd dimension KeyCollection
      m.bool(2, boxed);
    }).toThrow(/Invalid arguments provided for boolean variable creation/);

    // Generic wrappers constrained by C extends KeyCollection<string> resolve cleanly
    function makeGenericBinary<K extends string, C extends KeyCollection<K>>(keys: C) {
      return m.binary(keys, { prefix: "gen" });
    }
    function makeGenericMatrix<
      R extends string,
      C extends string,
      RC extends KeyCollection<R>,
      CC extends KeyCollection<C>,
    >(rows: RC, cols: CC) {
      return m.continuous(rows, cols, { prefix: "gmat" });
    }
    const genBin = makeGenericBinary(["g1", "g2"] as const);
    expect(genBin.g1.name).toBe("gen_g1");
    const genMat = makeGenericMatrix(["r1"] as const, ["c1"] as const);
    expect(genMat.r1.c1.name).toBe("gmat_r1_c1");

    // Custom iterable with primitive valueOf(): number and charAt(): string is accepted at compile time and runtime
    const customIterable = {
      *[Symbol.iterator](): IterableIterator<"k1" | "k2"> {
        yield "k1";
        yield "k2";
      },
      valueOf(): number {
        return 2;
      },
      charAt(): string {
        return "k";
      },
    };
    const customVars = m.binary(customIterable, { prefix: "cust" });
    expect(Object.keys(customVars)).toEqual(["k1", "k2"]);

    // Aliased one-shot iterator supplied for both dimensions preserves both rows and cols
    const oneShot1 = (["a", "b"] as const).values();
    const aliasedBin = m.binary(oneShot1, oneShot1, { prefix: "ab" });
    expect(Object.keys(aliasedBin)).toEqual(["a", "b"]);
    expect(Object.keys(aliasedBin.a)).toEqual(["a", "b"]);
    expect(Object.keys(aliasedBin.b)).toEqual(["a", "b"]);

    const oneShot2 = (["p", "q"] as const).values();
    const aliasedBool = m.bool(oneShot2, oneShot2, { prefix: "pq" });
    expect(Object.keys(aliasedBool)).toEqual(["p", "q"]);
    expect(Object.keys(aliasedBool.p)).toEqual(["p", "q"]);
    expect(Object.keys(aliasedBool.q)).toEqual(["p", "q"]);

    // Iterable objects are excluded from options overloads at compile time and treated as 2nd dimension when in 2nd position
    const iterableOpts = {
      prefix: "p",
      lb: 0,
      *[Symbol.iterator](): IterableIterator<"col"> {
        yield "col";
      },
    };
    const twoDimFromIterable: Array<Record<"col", Var>> = m.binary(2, iterableOpts);
    expect(twoDimFromIterable).toHaveLength(2);
    expect(Object.keys(twoDimFromIterable[0])).toEqual(["col"]);
    if (false as boolean) {
      // @ts-expect-error iterable object does not match 1D options overload returning Var[]
      const _bad1D: Var[] = m.binary(2, iterableOpts);
      // @ts-expect-error iterable object is not a valid BoundsOptions in scalar options position
      m.continuous("x_bad_opts", iterableOpts);
      // @ts-expect-error iterable object is not a valid BoundsOptions in 2D third-argument options position
      m.continuous(2, 2, iterableOpts);
    }
  });

  it("solves an assignment problem formulated cleanly with domain binary", async () => {
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
    const x = m.binary(workers, tasks);

    // Each worker assigned to exactly 1 task
    for (const w of workers) {
      m.constrain(sum(tasks.map((t) => x[w][t])).eq(1), `worker_${w}`);
    }

    // Each task assigned to exactly 1 worker
    for (const t of tasks) {
      m.constrain(sum(workers.map((w) => x[w][t])).eq(1), `task_${t}`);
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
