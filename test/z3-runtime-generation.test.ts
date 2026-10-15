import { afterEach, describe, expect, it, vi } from "vitest";

const { init, killThreads } = vi.hoisted(() => ({ init: vi.fn(), killThreads: vi.fn() }));
vi.mock("z3-solver", () => ({ init, killThreads }));

import { killZ3Threads, loadZ3, registerZ3ErrorHandler, resetZ3LoaderCache } from "../src/modeler/solvers/z3/loader.js";

function fakeInstance() {
  const worker = { onerror: undefined as undefined | ((error: unknown) => void), addEventListener: vi.fn() };
  return {
    em: {
      async_call: vi.fn().mockResolvedValue(1),
      PThread: { runningWorkers: [], unusedWorkers: [worker], terminateAllThreads: vi.fn() },
    },
  };
}

afterEach(async () => {
  await killZ3Threads();
  init.mockReset();
  killThreads.mockReset();
});

describe("Z3 initialization and runtime generations", () => {
  it("settles concurrent initialization failures and permits a fresh retry", async () => {
    init.mockRejectedValueOnce(new Error("initialization failed"));
    const results = await Promise.allSettled([loadZ3(), loadZ3()]);
    expect(init).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.reason.message).toContain("initialization failed");
    }
    const replacement = fakeInstance();
    init.mockResolvedValueOnce(replacement);
    expect(await loadZ3()).toBe(replacement);
  });

  it("rejects pending initialization on shutdown and disposes its late instance only", async () => {
    let finish!: (instance: ReturnType<typeof fakeInstance>) => void;
    init.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const outcome = Promise.allSettled([loadZ3()]);
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    await killZ3Threads();
    const [result] = await outcome;
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason.message).toContain("Z3 threads terminated");

    const replacement = fakeInstance();
    init.mockResolvedValueOnce(replacement);
    expect(await loadZ3()).toBe(replacement);
    const late = fakeInstance();
    finish(late);
    await vi.waitFor(() => expect(late.em.PThread.terminateAllThreads).toHaveBeenCalled());
    expect(replacement.em.PThread.terminateAllThreads).not.toHaveBeenCalled();
    expect(await loadZ3()).toBe(replacement);
  });

  it("does not invalidate a replacement when an older initialization rejects", async () => {
    let fail!: (error: Error) => void;
    init.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    const old = Promise.allSettled([loadZ3()]);
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    resetZ3LoaderCache();
    const replacement = fakeInstance();
    init.mockResolvedValueOnce(replacement);
    await loadZ3();
    fail(new Error("old initialization failure"));
    expect((await old)[0].status).toBe("rejected");
    expect(await loadZ3()).toBe(replacement);
    expect(replacement.em.PThread.terminateAllThreads).not.toHaveBeenCalled();
  });

  it("routes a late worker error only to its own instance and isolates subscribers", async () => {
    const old = fakeInstance();
    init.mockResolvedValueOnce(old);
    await loadZ3();
    const oldRejected = vi.fn();
    registerZ3ErrorHandler(() => { throw new Error("subscriber failed"); }, old);
    registerZ3ErrorHandler(oldRejected, old);
    resetZ3LoaderCache();
    const replacement = fakeInstance();
    init.mockResolvedValueOnce(replacement);
    await loadZ3();
    const replacementRejected = vi.fn();
    const unregister = registerZ3ErrorHandler(replacementRejected, replacement);
    try {
      old.em.PThread.unusedWorkers[0].onerror!({ message: "late old worker failure" });
      expect(oldRejected).toHaveBeenCalledOnce();
      expect(replacementRejected).not.toHaveBeenCalled();
      expect(old.em.PThread.terminateAllThreads).toHaveBeenCalled();
      expect(replacement.em.PThread.terminateAllThreads).not.toHaveBeenCalled();
      await killZ3Threads(old);
      expect(await loadZ3()).toBe(replacement);
      expect(replacementRejected).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });
});
