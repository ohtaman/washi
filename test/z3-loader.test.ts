import { describe, it, expect, vi, afterEach } from "vitest";
import { probeAssetUrl, ensureInitZ3Loaded } from "../src/modeler/solvers/z3/loader.js";

describe("Z3 Asset Loader & Probe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as any).initZ3;
  });

  describe("probeAssetUrl", () => {
    it("succeeds using HEAD without issuing a GET request when HEAD returns 200", async () => {
      const calls: { method: string; url: string; headers?: any }[] = [];
      const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push({ method: init?.method || "GET", url, headers: init?.headers });
        return new Response(null, {
          status: 200,
          headers: { "content-type": "application/javascript; charset=utf-8" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(probeAssetUrl("https://example.com/z3-built.js", "JS")).resolves.toBeUndefined();
      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe("HEAD");
    });

    it("falls back to GET with cache: no-store and succeeds when HEAD returns 403 (e.g. S3 signed URL)", async () => {
      const calls: { method: string; url: string; cache?: RequestCache; headers?: any }[] = [];
      const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push({
          method: init?.method || "GET",
          url,
          cache: init?.cache,
          headers: init?.headers,
        });

        if (init?.method === "HEAD") {
          // Simulate S3 / storage signed URL where HEAD is forbidden (403)
          return new Response(null, { status: 403, statusText: "Forbidden" });
        }

        // GET request succeeds
        return new Response("var initZ3;", {
          status: 206,
          headers: {
            "content-type": "application/javascript",
            "content-range": "bytes 0-3/1000",
          },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(probeAssetUrl("https://s3.amazonaws.com/bucket/z3-built.js?signature=abc", "JS")).resolves.toBeUndefined();
      expect(calls.length).toBe(2);
      expect(calls[0].method).toBe("HEAD");
      expect(calls[1].method).toBe("GET");
      expect(calls[1].cache).toBe("no-store");
      expect(calls[1].headers).toEqual({ Range: "bytes=0-3" });
    });

    it("falls back to GET with no-store when HEAD returns 405 (Method Not Allowed)", async () => {
      const calls: string[] = [];
      const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        calls.push(init?.method || "GET");
        if (init?.method === "HEAD") {
          return new Response(null, { status: 405, statusText: "Method Not Allowed" });
        }
        return new Response("data", {
          status: 200,
          headers: { "content-type": "application/wasm" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(probeAssetUrl("https://example.com/z3-built.wasm", "WASM")).resolves.toBeUndefined();
      expect(calls).toEqual(["HEAD", "GET"]);
    });

    it("falls back to GET when HEAD fails with network error", async () => {
      const calls: string[] = [];
      const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        calls.push(init?.method || "GET");
        if (init?.method === "HEAD") {
          throw new TypeError("Failed to fetch (CORS)");
        }
        return new Response("ok", {
          status: 200,
          headers: { "content-type": "application/wasm" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(probeAssetUrl("https://example.com/z3-built.wasm", "WASM")).resolves.toBeUndefined();
      expect(calls).toEqual(["HEAD", "GET"]);
    });

    it("rejects when both HEAD and GET return 404 Not Found", async () => {
      const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        return new Response("Not Found", {
          status: 404,
          statusText: "Not Found",
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(probeAssetUrl("https://example.com/missing.wasm", "WASM")).rejects.toThrow(
        "server responded with HTTP status 404"
      );
    });

    it("rejects when server responds with text/html (SPA routing fallback)", async () => {
      const fetchMock = vi.fn().mockImplementation(async () => {
        return new Response("<!DOCTYPE html><html></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(probeAssetUrl("https://example.com/z3-built.wasm", "WASM")).rejects.toThrow(
        'server responded with "text/html" instead of expected WASM'
      );
    });
  });

  describe("ensureInitZ3Loaded", () => {
    it("captures detailed syntax/runtime errors for hashed asset URLs", async () => {
      const hashedJsUrl = "https://cdn.example.com/assets/z3-built-a1b2c3d4.js?v=42";

      // Mock DOM environment
      let errorListener: ((ev: any) => void) | null = null;
      const windowMock = {
        addEventListener: vi.fn((type: string, listener: any) => {
          if (type === "error") errorListener = listener;
        }),
        removeEventListener: vi.fn(),
      };

      const appendChildMock = vi.fn((scriptEl: any) => {
        // Simulate error event firing during script evaluation
        if (errorListener) {
          errorListener({
            filename: "https://cdn.example.com/assets/z3-built-a1b2c3d4.js",
            error: new SyntaxError("Unexpected end of input"),
            message: "SyntaxError: Unexpected end of input",
          });
        }
        // Browser triggers onload even on parse error in classic script tags
        setTimeout(() => {
          if (scriptEl.onload) scriptEl.onload();
        }, 0);
      });

      const documentMock = {
        baseURI: "https://cdn.example.com/demo/",
        createElement: vi.fn(() => ({
          src: "",
          crossOrigin: "",
          onload: null,
          onerror: null,
        })),
        head: {
          appendChild: appendChildMock,
        },
      };

      vi.stubGlobal("window", windowMock);
      vi.stubGlobal("document", documentMock);

      await expect(ensureInitZ3Loaded(hashedJsUrl)).rejects.toThrow(
        /Failed to evaluate Z3 runtime script from ".*": SyntaxError: Unexpected end of input/
      );
    });

    it("captures detailed syntax errors for webpack hash filenames (<hash>.js)", async () => {
      const webpackJsUrl = "https://example.com/dist/8f3e2a1b.js";

      let errorListener: ((ev: any) => void) | null = null;
      const windowMock = {
        addEventListener: vi.fn((type: string, listener: any) => {
          if (type === "error") errorListener = listener;
        }),
        removeEventListener: vi.fn(),
      };

      const appendChildMock = vi.fn((scriptEl: any) => {
        if (errorListener) {
          errorListener({
            filename: "https://example.com/dist/8f3e2a1b.js",
            error: new SyntaxError("Unexpected token '<'"),
            message: "SyntaxError: Unexpected token '<'",
          });
        }
        setTimeout(() => {
          if (scriptEl.onload) scriptEl.onload();
        }, 0);
      });

      const documentMock = {
        baseURI: "https://example.com/",
        createElement: vi.fn(() => ({
          src: "",
          crossOrigin: "",
          onload: null,
          onerror: null,
        })),
        head: {
          appendChild: appendChildMock,
        },
      };

      vi.stubGlobal("window", windowMock);
      vi.stubGlobal("document", documentMock);

      await expect(ensureInitZ3Loaded(webpackJsUrl)).rejects.toThrow(
        /Failed to evaluate Z3 runtime script from ".*": SyntaxError: Unexpected token '<'/
      );
    });
  });
});
