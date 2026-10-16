import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isValidWasmHeader,
  setHighsWasmUrl,
  getHighsWasmUrl,
  resolveBrowserWasmUrl,
  OFFICIAL_HIGHS_CDN_WASM_URL,
  getHighs,
} from "../src/modeler/solvers/highs/loader.js";
import { Model, maximize } from "../src/index.js";

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
      expect(resolved).not.toBe(OFFICIAL_HIGHS_CDN_WASM_URL);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps CDN available only through an explicit choice", async () => {
      setHighsWasmUrl(OFFICIAL_HIGHS_CDN_WASM_URL);
      expect(await resolveBrowserWasmUrl()).toBe(OFFICIAL_HIGHS_CDN_WASM_URL);
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
