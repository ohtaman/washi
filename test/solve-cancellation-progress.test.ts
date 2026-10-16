import { afterEach, describe, expect, it, vi } from "vitest";
import { Model, sum, maximize, MockSolver, type SolveProgressEvent } from "../src/index.js";
import "../src/modeler/solvers/glpk/index.js";
import "../src/modeler/solvers/z3/index.js";

describe("Solve Cancellation and Progress Reporting (Issue #55)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns Interrupted immediately when AbortSignal is already aborted before solve", async () => {
    const model = new Model();
    const x = model.continuous("x", { lb: 0, ub: 10 });
    model.objective(maximize(x));

    const controller = new AbortController();
    controller.abort();

    const progressEvents: SolveProgressEvent[] = [];
    const status = await model.solve({
      signal: controller.signal,
      onProgress: (ev) => progressEvents.push(ev),
    });

    expect(status).toBe("Unknown");
    expect(model.terminationStatus).toBe("Interrupted");
    expect(model.hasPrimalSolution).toBe(false);
    expect(model.objectiveValue).toBeNull();
    expect(x.value).toBeNull();
    expect(progressEvents).toHaveLength(0);
  });

  it("emits real progress events and supports mid-solve cancellation via AbortSignal in HiGHS", async () => {
    const model = new Model();
    const n = 14;
    const x = Array.from({ length: n }, (_, i) => model.binary(`x_${i}`));
    // Subset sum / knapsack MIP that explores multiple checkpoints/incumbents
    const weights = [13, 17, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
    const values = [19, 23, 29, 37, 41, 47, 53, 59, 61, 67, 71, 73, 79, 83];
    model.constraint(
      sum(x.map((xi, i) => xi.mul(weights[i]))).le(180),
      "cap"
    );
    // Add an objective constant (+100) to verify progress metrics shift by offset
    model.objective(maximize(sum(x.map((xi, i) => xi.mul(values[i]))).add(100)));

    const progressEvents: SolveProgressEvent[] = [];
    const fullStatus = await model.solve({
      presolve: "off",
      onProgress: (ev) => {
        progressEvents.push(ev);
      },
    });

    expect(fullStatus).toBe("Optimal");
    expect(progressEvents.length).toBeGreaterThan(0);
    for (const ev of progressEvents) {
      expect(typeof ev.elapsedTime).toBe("number");
      expect(ev.elapsedTime).toBeGreaterThanOrEqual(0);
      expect(ev.elapsedSeconds).toBe(ev.elapsedTime);
      if (ev.objectiveValue !== undefined && ev.objectiveBound !== undefined) {
        expect(ev.absGap).toBeCloseTo(Math.abs(ev.objectiveValue - ev.objectiveBound), 6);
      }
    }
    const lastEv = progressEvents[progressEvents.length - 1];
    if (lastEv.objectiveValue !== undefined && model.objectiveValue !== null) {
      expect(lastEv.objectiveValue).toBeGreaterThanOrEqual(100);
    }

    // Now cancel during solve via onProgress once an incumbent is reported
    const controller = new AbortController();
    const cancelEvents: SolveProgressEvent[] = [];
    await model.solve({
      presolve: "off",
      signal: controller.signal,
      onProgress: (ev) => {
        cancelEvents.push(ev);
        if (ev.objectiveValue !== undefined) {
          controller.abort();
        }
      },
    });

    const cancelledSol = model.solution!;
    expect(cancelledSol.terminationStatus).toBe("Interrupted");
    expect(cancelEvents.length).toBeGreaterThan(0);
    if (cancelledSol.hasPrimalSolution) {
      expect(cancelledSol.status).toBe("Feasible");
      expect(cancelledSol.objectiveValue).not.toBeNull();
      expect(cancelledSol.objectiveValue!).toBeGreaterThanOrEqual(100);
      expect(Object.keys(cancelledSol.values).length).toBe(n);
    } else {
      expect(cancelledSol.status).toBe("Unknown");
      expect(cancelledSol.objectiveValue).toBeNull();
    }
  });

  it("terminates an in-flight Web Worker on abort, drops aborted queued requests without executing them, and creates a fresh worker for remaining queued requests", async () => {
    class ControllableFakeWorker {
      static instances: ControllableFakeWorker[] = [];
      onmessage: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onmessageerror: (() => void) | null = null;
      messages: any[] = [];
      terminate = vi.fn();
      postMessage(data: any) {
        this.messages.push(data);
      }
      constructor() {
        ControllableFakeWorker.instances.push(this);
      }
    }

    vi.resetModules();
    ControllableFakeWorker.instances = [];
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", ControllableFakeWorker);

    const { solveLp } = await import("../src/modeler/solvers/highs/worker-client.js");

    const controller1 = new AbortController();
    const controllerQueued = new AbortController();
    const receivedProgress: SolveProgressEvent[] = [];

    const firstPromise = solveLp("Maximize\n obj: x\nBounds\n 0 <= x <= 10\nBinary\n x\nEnd", {
      useWorker: true,
      signal: controller1.signal,
      onProgress: (ev) => receivedProgress.push(ev),
    });

    // Queue a request that will be cancelled while waiting in the queue
    const cancelledQueuedPromise = solveLp("Maximize\n obj: x\nBounds\n 0 <= x <= 3\nEnd", {
      useWorker: true,
      signal: controllerQueued.signal,
    });

    // Queue a third request behind the second
    const thirdPromise = solveLp("Maximize\n obj: x\nBounds\n 0 <= x <= 5\nEnd", {
      useWorker: true,
    });

    // Only the head request (req1) should be posted to the Worker while it is busy
    await vi.waitFor(() =>
      expect(ControllableFakeWorker.instances[0]?.messages).toHaveLength(1)
    );
    const firstWorker = ControllableFakeWorker.instances[0];
    const req1Id = firstWorker.messages[0].id;
    expect(firstWorker.messages[0].reportProgress).toBe(true);
    // Ensure non-cloneable signal/onProgress were stripped before postMessage
    expect(firstWorker.messages[0].options.signal).toBeUndefined();
    expect(firstWorker.messages[0].options.onProgress).toBeUndefined();

    // Cancel the second (queued) request before req1 finishes
    controllerQueued.abort();
    const cancelledQueuedRes = await cancelledQueuedPromise;
    expect(cancelledQueuedRes.result.Status).toBe("Interrupted");
    expect(cancelledQueuedRes.result.HasPrimalSolution).toBe(false);
    // Active worker must NOT be terminated when a non-active queued request is aborted
    expect(firstWorker.terminate).not.toHaveBeenCalled();
    expect(firstWorker.messages).toHaveLength(1);

    // Simulate Worker streaming an incumbent and a progress event for req1
    firstWorker.onmessage?.({
      data: {
        type: "SOLVE_INCUMBENT",
        id: req1Id,
        incumbent: {
          objectiveValue: 1,
          mipDualBound: 1,
          mipGap: 0,
          columns: {
            x: { Index: 0, Type: "Integer", Name: "x", Primal: 1 },
          },
        },
      },
    });
    firstWorker.onmessage?.({
      data: {
        type: "SOLVE_PROGRESS",
        id: req1Id,
        progress: {
          elapsedTime: 0.05,
          elapsedSeconds: 0.05,
          objectiveValue: 1,
          objectiveBound: 1,
          relGap: 0,
          absGap: 0,
          nodes: 2,
          iterations: 5,
        },
      },
    });

    expect(receivedProgress).toHaveLength(1);
    expect(receivedProgress[0].objectiveValue).toBe(1);

    // Abort the first solve while it is still running in the Worker
    controller1.abort();

    const firstRes = await firstPromise;
    expect(firstWorker.terminate).toHaveBeenCalledOnce();
    expect(firstRes.result.Status).toBe("Interrupted");
    expect(firstRes.result.StatusCode).toBe(17);
    expect(firstRes.result.HasPrimalSolution).toBe(true);
    expect(firstRes.result.ObjectiveValue).toBe(1);
    expect(firstRes.result.Columns.x.Primal).toBe(1);

    // Verify only the un-aborted third request was dispatched onto a fresh Worker (instance[1]),
    // skipping the already-cancelled second request
    await vi.waitFor(() => expect(ControllableFakeWorker.instances).toHaveLength(2));
    const secondWorker = ControllableFakeWorker.instances[1];
    expect(secondWorker.messages).toHaveLength(1);
    const req3Id = secondWorker.messages[0].id;
    expect(secondWorker.messages[0].lpString).toContain("0 <= x <= 5");

    secondWorker.onmessage?.({
      data: {
        type: "SOLVE_SUCCESS",
        id: req3Id,
        result: {
          Status: "Optimal",
          StatusCode: 7,
          HasPrimalSolution: true,
          ObjectiveValue: 5,
          Columns: { x: { Index: 0, Type: "Continuous", Name: "x", Primal: 5 } },
        },
        runTime: 0.01,
      },
    });

    const thirdRes = await thirdPromise;
    expect(thirdRes.result.Status).toBe("Optimal");
    expect(thirdRes.result.ObjectiveValue).toBe(5);
  });

  it("supports cancellation and progress events across MockSolver, GLPK, and Z3", async () => {
    const model = new Model();
    const x = model.integer("x", { lb: 0, ub: 10 });
    model.constraint(x.le(7));
    model.objective(maximize(x));

    // 1. MockSolver with progressEvents and cancellation
    const mockEvents: SolveProgressEvent[] = [];
    const mockCtrl = new AbortController();
    const mockSolver = new MockSolver({
      status: "Optimal",
      objectiveValue: 7,
      values: { x: 7 },
      progressEvents: [
        { elapsedTime: 0.01, elapsedSeconds: 0.01, objectiveValue: 5, objectiveBound: 10, relGap: 1.0, absGap: 5 },
        { elapsedTime: 0.02, elapsedSeconds: 0.02, objectiveValue: 7, objectiveBound: 7, relGap: 0, absGap: 0 },
      ],
    });
    await model.solve({
      solver: mockSolver,
      signal: mockCtrl.signal,
      onProgress: (ev) => {
        mockEvents.push(ev);
        mockCtrl.abort();
      },
    });
    const mockSol = model.solution!;
    expect(mockEvents).toHaveLength(1);
    expect(mockSol.terminationStatus).toBe("Interrupted");
    expect(mockSol.status).toBe("Feasible");
    expect(mockSol.hasPrimalSolution).toBe(true);
    expect(mockSol.objectiveValue).toBe(7);

    // 2. GLPK progress reporting, post-solve callback abort preservation, and pre-abort
    const glpkEvents: SolveProgressEvent[] = [];
    const glpkPostCtrl = new AbortController();
    const glpkStatus = await model.solve({
      solver: "glpk",
      signal: glpkPostCtrl.signal,
      onProgress: (ev) => {
        glpkEvents.push(ev);
        glpkPostCtrl.abort();
      },
    });
    expect(glpkStatus).toBe("Optimal");
    expect(model.terminationStatus).toBe("Optimal");
    expect(glpkEvents.length).toBeGreaterThan(0);

    const abortedCtrl = new AbortController();
    abortedCtrl.abort();
    await model.solve({
      solver: "glpk",
      signal: abortedCtrl.signal,
    });
    expect(model.terminationStatus).toBe("Interrupted");
    expect(model.hasPrimalSolution).toBe(false);

    // 3. Z3 progress reporting, post-solve callback abort preservation, and pre-abort
    const z3Events: SolveProgressEvent[] = [];
    const z3PostCtrl = new AbortController();
    const z3Status = await model.solve({
      solver: "z3",
      signal: z3PostCtrl.signal,
      onProgress: (ev) => {
        z3Events.push(ev);
        if (ev.objectiveValue !== undefined) {
          z3PostCtrl.abort();
        }
      },
    });
    expect(z3Status).toBe("Optimal");
    expect(model.terminationStatus).toBe("Optimal");
    expect(z3Events.length).toBeGreaterThan(0);

    await model.solve({
      solver: "z3",
      signal: abortedCtrl.signal,
    });
    expect(model.terminationStatus).toBe("Interrupted");
    expect(model.hasPrimalSolution).toBe(false);
  });
});
