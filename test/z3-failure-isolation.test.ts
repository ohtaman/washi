import { afterEach, describe, expect, it, vi } from "vitest";
import { Mutex, Semaphore } from "async-mutex";
import { Model, maximize } from "../src/index.js";
import "../src/modeler/solvers/z3/index.js";
import { killZ3Threads, loadZ3, notifyZ3WorkerError } from "../src/modeler/solvers/z3/loader.js";

const originalAcquire = Semaphore.prototype.acquire;

afterEach(async () => {
  await killZ3Threads();
  vi.restoreAllMocks();
});

describe("Z3 runtime failure isolation", () => {
  it("does not patch application mutexes or release/cancel their owners and waiters", async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await loadZ3();
    const mutex = new Mutex();
    const releaseOwner = await mutex.acquire();
    let acquired = false;
    const waiter = mutex.acquire().then(release => { acquired = true; release(); });
    // Attach rejection handling before the historical global cancel could run.
    const settled = Promise.allSettled([waiter]);
    try {
      notifyZ3WorkerError(new Error("synthetic Z3 failure"));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(Semaphore.prototype.acquire).toBe(originalAcquire);
      expect(mutex.isLocked()).toBe(true);
      expect(acquired).toBe(false);
    } finally {
      releaseOwner();
    }
    expect((await settled)[0].status).toBe("fulfilled");
    expect(acquired).toBe(true);
  });

  it("rejects active and queued real Z3 operations, releases its own lock, and recovers", async () => {
    const instance = await loadZ3();
    let started!: () => void;
    const inFlight = new Promise<void>(resolve => { started = resolve; });
    const asyncCall = instance.em.async_call;
    instance.em.async_call = function (...args: unknown[]) {
      const result = asyncCall.apply(this, args);
      started();
      return result;
    };
    const m1 = new Model();
    m1.constraint(m1.bool("required"));
    const m2 = new Model();
    const x = m2.integer("x", { lb: 0, ub: 7 });
    m2.objective(maximize(x));
    const results = Promise.allSettled([m1.check("z3"), m2.solve("z3")]);
    await inFlight;
    const workers = [...instance.em.PThread.runningWorkers, ...instance.em.PThread.unusedWorkers];
    expect(workers.length).toBeGreaterThan(0);
    const staleError = workers[0].onerror;
    expect(typeof staleError).toBe("function");
    staleError({ message: "injected worker failure" });
    for (const result of await results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.reason.message).toContain("injected worker failure");
    }

    const replacement = await loadZ3();
    expect(replacement).not.toBe(instance);
    // Late old-worker events and explicit cleanup of the old instance must not
    // reset or terminate the healthy replacement.
    staleError({ message: "late old-worker error" });
    await killZ3Threads(instance);
    expect(await loadZ3()).toBe(replacement);
    expect((await m1.check("z3")).status).toBe("Sat");
    expect(await m2.solve("z3")).toBe("Optimal");
    expect(x.value).toBe(7);
  }, 15_000);

  it("settles an in-flight operation on shutdown without releasing an application lock", async () => {
    const mutex = new Mutex();
    const release = await mutex.acquire();
    const instance = await loadZ3();
    const call = instance.em.async_call;
    let started!: () => void;
    const inFlight = new Promise<void>(resolve => { started = resolve; });
    instance.em.async_call = function (...args: unknown[]) {
      const result = call.apply(this, args);
      started();
      return result;
    };
    const m = new Model();
    m.constraint(m.bool("present"));
    const outcome = Promise.allSettled([m.check("z3")]);
    try {
      await inFlight;
      await killZ3Threads();
      const [result] = await outcome;
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.reason.message).toContain("Z3 threads terminated");
      expect(mutex.isLocked()).toBe(true);
      expect((await m.check("z3")).status).toBe("Sat");
    } finally {
      release();
    }
  }, 15_000);
});
