import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as highsLoader from "../src/modeler/solvers/highs/loader.js";
import * as highsIndex from "../src/modeler/solvers/highs/index.js";
import { Highs } from "../src/modeler/solvers/highs/driver.js";
import {
  isValidWasmHeader,
  setHighsWasmUrl,
  getHighsWasmUrl,
  resolveBrowserWasmUrl,
  solveLpWithHighs,
} from "../src/modeler/solvers/highs/loader.js";
import { Model, maximize } from "../src/index.js";

const CDN_HIGHS_WASM_URL = "https://cdn.jsdelivr.net/npm/highs@1.15.1/build/highs.wasm";

describe("HiGHS WebAssembly Loader & Resolver", () => {
  beforeEach(() => {
    setHighsWasmUrl(null);
  });

  afterEach(() => {
    setHighsWasmUrl(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("isValidWasmHeader", () => {
    it("returns true for standard WebAssembly magic bytes (\\0asm)", () => {
      const validWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      expect(isValidWasmHeader(validWasm)).toBe(true);
    });

    it("returns false for HTML DOCTYPE (<!DO)", () => {
      const htmlBytes = new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]);
      expect(isValidWasmHeader(htmlBytes)).toBe(false);
    });

    it("returns false for empty or truncated bytes", () => {
      expect(isValidWasmHeader(new Uint8Array([]))).toBe(false);
      expect(isValidWasmHeader(new Uint8Array([0x00, 0x61]))).toBe(false);
    });
  });

  describe("setHighsWasmUrl & getHighsWasmUrl", () => {
    it("allows configuring and clearing custom WASM URL", () => {
      expect(getHighsWasmUrl()).toBeNull();

      setHighsWasmUrl("https://example.com/custom-highs.wasm");
      expect(getHighsWasmUrl()).toBe("https://example.com/custom-highs.wasm");

      setHighsWasmUrl(null);
      expect(getHighsWasmUrl()).toBeNull();
    });
  });

  describe("resolveBrowserWasmUrl", () => {
    it("returns explicit URL option strictly without probing or falling back to CDN", async () => {
      const explicit = "/my-airgapped-assets/highs.wasm";
      const resolved = await resolveBrowserWasmUrl(explicit);
      expect(resolved).toBe(explicit);
    });

    it("returns customWasmUrl strictly without probing or falling back to CDN", async () => {
      setHighsWasmUrl("https://enterprise.internal/highs.wasm");
      const resolved = await resolveBrowserWasmUrl();
      expect(resolved).toBe("https://enterprise.internal/highs.wasm");
    });

    it("resolves the bundled asset without any network probe", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("network blocked"));
      vi.stubGlobal("fetch", fetchMock);
      const resolved = await resolveBrowserWasmUrl();
      expect(resolved).toBe(new URL("../public/highs.wasm", import.meta.url).href);
      expect(resolved).not.toBe(CDN_HIGHS_WASM_URL);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps CDN available only through an explicit choice", async () => {
      setHighsWasmUrl(CDN_HIGHS_WASM_URL);
      expect(await resolveBrowserWasmUrl()).toBe(CDN_HIGHS_WASM_URL);
    });

    it("removes legacy OFFICIAL_HIGHS_CDN_WASM_URL and probeWasmUrl exports", () => {
      expect((highsLoader as any).OFFICIAL_HIGHS_CDN_WASM_URL).toBeUndefined();
      expect((highsLoader as any).probeWasmUrl).toBeUndefined();
      expect((highsIndex as any).OFFICIAL_HIGHS_CDN_WASM_URL).toBeUndefined();
      expect((highsIndex as any).probeWasmUrl).toBeUndefined();
    });
  });

  describe("Strict HiGHS Loader & Driver Error Propagation", () => {
    it("throws when highs.withModel is unavailable instead of falling back to legacy highs.solve()", async () => {
      vi.resetModules();
      vi.doMock("../src/modeler/solvers/highs/node-runtime.js", () => ({
        loadNodeHighs: async () => async () => ({
          solve: vi.fn(),
        }),
      }));
      try {
        const freshLoader = await import("../src/modeler/solvers/highs/loader.js");
        await expect(
          freshLoader.solveLpWithHighs("Maximize\n obj: x\nEnd")
        ).rejects.toThrow(/withModel/i);
      } finally {
        vi.doUnmock("../src/modeler/solvers/highs/node-runtime.js");
        vi.resetModules();
      }
    });

    it("rethrows unsupported or invalid HiGHS options in both solveLpWithHighs and Highs.solve", async () => {
      const lp = "Maximize\n obj: x\nSubject To\n c1: x <= 5\nBounds\n 0 <= x <= 5\nEnd\n";

      // Invalid value for known HiGHS option (negative timeLimit)
      await expect(solveLpWithHighs(lp, { timeLimit: -1 })).rejects.toThrow(
        /HighsUnsupportedOptionError|not supported|invalid|timeLimit/i
      );

      // Invalid HiGHS solver algorithm string (swallowed before!)
      await expect(solveLpWithHighs(lp, { solver: "bogus_algo" })).rejects.toThrow(
        /HighsUnsupportedOptionError|not supported|invalid/i
      );

      // Unsupported WaSHI SolveOptions keys
      await expect(solveLpWithHighs(lp, { threads: 4 })).rejects.toThrow(/threads/i);
      await expect(solveLpWithHighs(lp, { verbose: true })).rejects.toThrow(/verbose/i);
      await expect(solveLpWithHighs(lp, { unknownOpt: 123 })).rejects.toThrow(/unknownOpt/i);

      // Highs.prototype.solve() must not swallow option-set errors
      const highs = await highsLoader.getHighs();
      expect(() => highs.solve(lp, { nonexistent_highs_option: 123 })).toThrow(
        /not supported or invalid/i
      );
    });

    it("validates objectiveOffset and throws if non-zero offset cannot be applied", async () => {
      const lp = "Maximize\n obj: x\nSubject To\n c1: x <= 5\nBounds\n 0 <= x <= 5\nEnd\n";

      await expect(solveLpWithHighs(lp, { objectiveOffset: Number.NaN })).rejects.toThrow(
        /objectiveOffset/i
      );
      await expect(solveLpWithHighs(lp, { objectiveOffset: Number.POSITIVE_INFINITY })).rejects.toThrow(
        /objectiveOffset/i
      );
      await expect(solveLpWithHighs(lp, { objectiveOffset: "10" as any })).rejects.toThrow(
        /objectiveOffset/i
      );

      // Zero objectiveOffset results in ObjectiveOffsetApplied: false
      const zeroOffsetRes = await solveLpWithHighs(lp, { objectiveOffset: 0 });
      expect(zeroOffsetRes.result.ObjectiveOffsetApplied).toBe(false);

      // Non-zero objectiveOffset when changeObjectiveOffset is unavailable must throw
      vi.resetModules();
      vi.doMock("../src/modeler/solvers/highs/node-runtime.js", () => ({
        loadNodeHighs: async () => async () => ({
          withModel: (_input: unknown, action: (m: any) => unknown) =>
            action({
              options: { set: vi.fn() },
              getDimensions: () => ({ numCols: 1, numRows: 0 }),
              getColIntegrality: () => 0,
              getColName: () => "x",
              run: () => 0,
              getModelStatus: () => 7,
              info: { get: () => 2 },
              getSolution: () => ({
                colValue: new Float64Array([5]),
                colDual: new Float64Array([0]),
                rowValue: new Float64Array([]),
                rowDual: new Float64Array([]),
              }),
              getObjectiveValue: () => 5,
            }),
        }),
      }));
      try {
        const freshLoader = await import("../src/modeler/solvers/highs/loader.js");
        await expect(
          freshLoader.solveLpWithHighs(lp, { objectiveOffset: 10 })
        ).rejects.toThrow(/changeObjectiveOffset/i);
      } finally {
        vi.doUnmock("../src/modeler/solvers/highs/node-runtime.js");
        vi.resetModules();
      }
    });

    it("throws in HighsModel.run() when callbacks are requested without module.addFunction", () => {
      const mockModule: any = {
        cwrap: () => () => 0,
        _malloc: () => 16,
        _free: () => {},
        getValue: () => 0,
        setValue: () => {},
        UTF8ToString: () => "",
        stringToUTF8: () => {},
        FS: { writeFile: () => {}, unlink: () => {} },
      };
      const highs = new Highs(mockModule);
      expect(() =>
        highs.withModel({ format: "lp", data: "Minimize\n obj: 0\nEnd" }, (m) =>
          m.run({ 1: () => undefined })
        )
      ).toThrow(/addFunction/i);
    });
  });

  describe("Node.js seamless operation", () => {
    it("solves optimization problems out-of-the-box in Node.js without any configuration", async () => {
      const model = new Model({ name: "NodeTest" });
      const x = model.continuous("x", { lb: 0, ub: 10 });
      const y = model.continuous("y", { lb: 0, ub: 10 });
      model.constraint(x.add(y).le(12), "c1");
      model.objective(maximize(x.mul(3).add(y.mul(2))));

      const status = await model.solve();
      expect(status).toBe("Optimal");
      expect(model.objectiveValue).toBe(34);
      expect(x.value).toBe(10);
      expect(y.value).toBe(2);
    });
  });
});
