import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isValidWasmHeader,
  setHighsWasmUrl,
  getHighsWasmUrl,
  resolveBrowserWasmUrl,
  OFFICIAL_HIGHS_CDN_WASM_URL,
  getHighs,
} from "../src/highs-loader.js";
import { Model } from "../src/index.js";

describe("HiGHS WebAssembly Loader & Resolver", () => {
  beforeEach(() => {
    setHighsWasmUrl(null);
  });

  afterEach(() => {
    setHighsWasmUrl(null);
    vi.restoreAllMocks();
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

    it("falls back to official CDN when local probe returns 404", async () => {
      // Mock global fetch to return 404
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const resolved = await resolveBrowserWasmUrl();
      expect(resolved).toBe(OFFICIAL_HIGHS_CDN_WASM_URL);
    });

    it("falls back to official CDN when local probe returns HTML (SPA index.html fallback)", async () => {
      // Mock global fetch returning HTML content
      const headers = new Headers();
      headers.set("content-type", "text/html; charset=utf-8");

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers,
      });
      vi.stubGlobal("fetch", fetchMock);

      const resolved = await resolveBrowserWasmUrl();
      expect(resolved).toBe(OFFICIAL_HIGHS_CDN_WASM_URL);
    });

    it("adopts local URL when local probe returns a valid WASM binary", async () => {
      const validWasmHeader = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00]);
      const headers = new Headers();
      headers.set("content-type", "application/wasm");

      const mockBody = {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ value: validWasmHeader, done: false }),
          cancel: vi.fn().mockResolvedValue(undefined),
        }),
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers,
        body: mockBody,
      });
      vi.stubGlobal("fetch", fetchMock);

      const resolved = await resolveBrowserWasmUrl();
      expect(resolved).toMatch(/highs\.wasm$/);
      expect(resolved).not.toBe(OFFICIAL_HIGHS_CDN_WASM_URL);
    });
  });

  describe("Node.js seamless operation", () => {
    it("solves optimization problems out-of-the-box in Node.js without any configuration", async () => {
      const model = new Model({ name: "NodeTest" });
      const x = model.addVar({ name: "x", lb: 0, ub: 10 });
      const y = model.addVar({ name: "y", lb: 0, ub: 10 });
      model.addConstraint(x.add(y).le(12), "c1");
      model.setObjective(x.mul(3).add(y.mul(2)), "Maximize");

      const status = await model.solve();
      expect(status).toBe("Optimal");
      expect(model.objectiveValue).toBe(34);
      expect(x.value).toBe(10);
      expect(y.value).toBe(2);
    });
  });
});
