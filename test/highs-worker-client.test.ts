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

  it("defaults to main-thread execution on opaque or file: origins unless useWorker: true is passed", async () => {
    for (const loc of [
      { origin: "null", protocol: "about:" },
      { origin: "file://", protocol: "file:" },
    ]) {
      vi.resetModules();
      FakeWorker.instances = [];
      vi.stubGlobal("window", { location: loc });
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

  it("defaults to Web Worker execution on standard web origins", async () => {
    vi.stubGlobal("window", { location: { origin: "https://example.com", protocol: "https:" } });
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
  });
});
