import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: any[] = [];
  terminate = vi.fn();
  postMessage(data: any) { this.messages.push(data); }
  constructor() { FakeWorker.instances.push(this); }
}

describe("HiGHS worker failures", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeWorker.instances = [];
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", FakeWorker);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("rejects all pending requests on a load error and permits a fresh worker", async () => {
    const { solveLp } = await import("../src/modeler/solvers/highs/worker-client.js");
    const requests = [solveLp("first"), solveLp("second")];
    const rejected = requests.map((request) => expect(request).rejects.toThrow("Worker failed"));
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.messages).toHaveLength(1));
    const failed = FakeWorker.instances[0];
    failed.onerror?.({ message: "404" });
    await Promise.all(rejected);
    expect(failed.terminate).toHaveBeenCalledOnce();

    const retry = solveLp("retry");
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(2));
    const worker = FakeWorker.instances[1];
    const id = worker.messages[0].id;
    worker.onmessage?.({ data: { type: "SOLVE_SUCCESS", id, result: { Status: "Optimal" }, runTime: 0 } });
    await expect(retry).resolves.toMatchObject({ result: { Status: "Optimal" } });
  });

  it("rejects when a response cannot be deserialized", async () => {
    const { solveLp } = await import("../src/modeler/solvers/highs/worker-client.js");
    const request = solveLp("model");
    const rejected = expect(request).rejects.toThrow("deserialize");
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.messages).toHaveLength(1));
    FakeWorker.instances[0].onmessageerror?.();
    await rejected;
  });

  it("rejects a failed postMessage instead of leaving a pending promise", async () => {
    vi.spyOn(FakeWorker.prototype, "postMessage").mockImplementationOnce(() => { throw new Error("clone failed"); });
    const { solveLp } = await import("../src/modeler/solvers/highs/worker-client.js");
    await expect(solveLp("model")).rejects.toThrow("clone failed");
  });

  it("defaults to main-thread execution when effective window.origin is opaque or file:, including URL-loaded sandboxed iframes", async () => {
    for (const winStub of [
      // URL-loaded <iframe sandbox="allow-scripts" src="https://example.com/embed.html">:
      // location.origin is the HTTPS URL origin, whereas effective window.origin is "null".
      { origin: "null", location: { origin: "https://example.com", protocol: "https:" } },
      // Local file:// page in Chromium (window.origin === "null", location.origin === "file://")
      { origin: "null", location: { origin: "file://", protocol: "file:" } },
      // Fallback path when synthetic environment omits window.origin on file:
      { location: { origin: "file://", protocol: "file:" } },
    ]) {
      vi.resetModules();
      FakeWorker.instances = [];
      vi.stubGlobal("window", winStub);
      vi.stubGlobal("Worker", FakeWorker);

      const loader = await import("../src/modeler/solvers/highs/loader.js");
      vi.spyOn(loader, "resolveBrowserWasmUrl").mockResolvedValue("https://cdn.example.com/highs.wasm");
      const mainThreadSpy = vi
        .spyOn(loader, "solveLpWithHighs")
        .mockResolvedValue({ result: { Status: "Optimal", ObjectiveValue: 42, Columns: {}, Rows: [] }, runTime: 0.01 });

      const { solveLp } = await import("../src/modeler/solvers/highs/worker-client.js");

      const defaultRes = await solveLp("Maximize\n obj: x\nEnd");
      expect(defaultRes.result.Status).toBe("Optimal");
      expect(FakeWorker.instances).toHaveLength(0);
      expect(mainThreadSpy).toHaveBeenCalledOnce();

      const explicitWorkerPromise = solveLp("Maximize\n obj: x\nEnd", { useWorker: true });
      await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
      const worker = FakeWorker.instances[0];
      const reqId = worker.messages[0].id;
      worker.onmessage?.({
        data: { type: "SOLVE_SUCCESS", id: reqId, result: { Status: "Optimal" }, runTime: 0.01 },
      });
      await expect(explicitWorkerPromise).resolves.toMatchObject({ result: { Status: "Optimal" } });
    }
  });

  it("defaults to Web Worker execution on standard web origins and inherited-origin about:blank iframes", async () => {
    for (const winStub of [
      { origin: "https://example.com", location: { origin: "https://example.com", protocol: "https:" } },
      // Same-origin about:blank iframe inherits window.origin from parent even though location.origin is "null".
      { origin: "https://example.com", location: { origin: "null", protocol: "about:" } },
    ]) {
      vi.resetModules();
      FakeWorker.instances = [];
      vi.stubGlobal("window", winStub);
      vi.stubGlobal("Worker", FakeWorker);

      const loader = await import("../src/modeler/solvers/highs/loader.js");
      vi.spyOn(loader, "resolveBrowserWasmUrl").mockResolvedValue("https://cdn.example.com/highs.wasm");

      const { solveLp } = await import("../src/modeler/solvers/highs/worker-client.js");
      const req = solveLp("Maximize\n obj: x\nEnd");
      await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
      const worker = FakeWorker.instances[0];
      worker.onmessage?.({
        data: { type: "SOLVE_SUCCESS", id: worker.messages[0].id, result: { Status: "Optimal" }, runTime: 0.01 },
      });
      await expect(req).resolves.toMatchObject({ result: { Status: "Optimal" } });
    }
  });

  it("warms up the HiGHS worker once per active worker instance and resets cache on worker failure", async () => {
    vi.resetModules();
    FakeWorker.instances = [];
    vi.stubGlobal("window", { origin: "https://example.com", location: { origin: "https://example.com", protocol: "https:" } });
    vi.stubGlobal("Worker", FakeWorker);

    const loader = await import("../src/modeler/solvers/highs/loader.js");
    vi.spyOn(loader, "resolveBrowserWasmUrl").mockResolvedValue("https://cdn.example.com/highs.wasm");

    const { isHighsWarmed, warmupHighs } = await import(
      "../src/modeler/solvers/highs/worker-client.js"
    );
    await expect(isHighsWarmed()).resolves.toBe(false);

    const firstWarmup = warmupHighs();
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.messages).toHaveLength(1));
    const worker1 = FakeWorker.instances[0];
    expect(worker1.messages[0].type).toBe("WARMUP");
    worker1.onmessage?.({ data: { type: "WARMUP_SUCCESS", id: worker1.messages[0].id } });
    await expect(firstWarmup).resolves.toEqual({ cached: false });
    await expect(isHighsWarmed()).resolves.toBe(true);

    // Second warmup on the same healthy worker must short-circuit without posting
    await expect(warmupHighs()).resolves.toEqual({ cached: true });
    expect(worker1.messages).toHaveLength(1);

    // Worker crash clears warmed state so retry warms a fresh worker
    worker1.onerror?.({ message: "worker crashed" });
    await expect(isHighsWarmed()).resolves.toBe(false);
    const retryWarmup = warmupHighs();
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(2));
    const worker2 = FakeWorker.instances[1];
    expect(worker2.messages[0].type).toBe("WARMUP");
    worker2.onmessage?.({ data: { type: "WARMUP_SUCCESS", id: worker2.messages[0].id } });
    await expect(retryWarmup).resolves.toEqual({ cached: false });
  });

  it("terminates active worker, settles warmup, and redispatches queued requests when warmupHighs is aborted", async () => {
    vi.resetModules();
    FakeWorker.instances = [];
    vi.stubGlobal("window", { origin: "https://example.com", location: { origin: "https://example.com", protocol: "https:" } });
    vi.stubGlobal("Worker", FakeWorker);

    const loader = await import("../src/modeler/solvers/highs/loader.js");
    vi.spyOn(loader, "resolveBrowserWasmUrl").mockResolvedValue("https://cdn.example.com/highs.wasm");

    const { isHighsWarmed, warmupHighs, solveLp } = await import(
      "../src/modeler/solvers/highs/worker-client.js"
    );

    const ac = new AbortController();
    const warmupPromise = warmupHighs({ signal: ac.signal });
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.messages).toHaveLength(1));
    const worker1 = FakeWorker.instances[0];
    expect(worker1.messages[0].type).toBe("WARMUP");

    const queuedSolve = solveLp("Maximize\n obj: x\nEnd");
    ac.abort();

    await expect(warmupPromise).resolves.toEqual({ cached: false });
    expect(worker1.terminate).toHaveBeenCalledOnce();
    await expect(isHighsWarmed()).resolves.toBe(false);

    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(2));
    const worker2 = FakeWorker.instances[1];
    expect(worker2.messages).toHaveLength(1);
    expect(worker2.messages[0].type).toBe("SOLVE");
    worker2.onmessage?.({
      data: { type: "SOLVE_SUCCESS", id: worker2.messages[0].id, result: { Status: "Optimal" }, runTime: 0.01 },
    });
    await expect(queuedSolve).resolves.toMatchObject({ result: { Status: "Optimal" } });
    await expect(isHighsWarmed()).resolves.toBe(true);
  });
});
