import type { SolveOptions } from "./modeler/types.js";

export const OFFICIAL_HIGHS_CDN_WASM_URL =
  "https://cdn.jsdelivr.net/npm/highs@1.15.3/build/highs.wasm";

type HighsInstance = any;

let cachedHighsPromise: Promise<HighsInstance> | null = null;
let customWasmUrl: string | null = null;

export function setHighsWasmUrl(url: string | null) {
  customWasmUrl = url;
  // Invalidate cache if wasm url changes before load
  cachedHighsPromise = null;
}

export function getHighsWasmUrl(): string | null {
  return customWasmUrl;
}

/**
 * Check if the given byte array begins with the standard WebAssembly magic header (\0asm).
 */
export function isValidWasmHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d
  );
}

/**
 * Probe a URL to determine whether it serves a valid WebAssembly binary
 * without downloading the entire file. Cancels the stream after checking the first chunk.
 */
export async function probeWasmUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-3" },
    });

    if (!res.ok) {
      return false;
    }

    const contentType = res.headers.get("content-type") || "";
    // If the server returned an HTML page (e.g. 404 SPA fallback to index.html), it's not valid WASM
    if (contentType.includes("text/html")) {
      return false;
    }

    if (!res.body) {
      return true;
    }

    const reader = res.body.getReader();
    const { value, done } = await reader.read();
    await reader.cancel();

    if (done || !value || value.length < 4) {
      return false;
    }

    return isValidWasmHeader(value);
  } catch {
    return false;
  }
}

/**
 * Resolve the HiGHS WASM URL for browser / worker environments.
 * - Explicit URLs (customWasmUrl or options.wasmUrl) are strictly used (no CDN fallback).
 * - Default resolution probes the local origin; if missing or returning HTML, falls back to the official CDN.
 */
export async function resolveBrowserWasmUrl(explicitUrl?: string): Promise<string> {
  if (explicitUrl) {
    return explicitUrl;
  }
  if (customWasmUrl) {
    return customWasmUrl;
  }

  const localUrl =
    typeof window !== "undefined"
      ? new URL("/highs.wasm", window.location.origin).href
      : typeof self !== "undefined" && (self as any).location
      ? new URL("highs.wasm", (self as any).location.href).href
      : "/highs.wasm";

  const isLocalValid = await probeWasmUrl(localUrl);
  if (isLocalValid) {
    return localUrl;
  }

  if (typeof console !== "undefined" && console.info) {
    console.info(
      `[WaSHI] Local highs.wasm not found or invalid at "${localUrl}". Automatically falling back to official CDN: ${OFFICIAL_HIGHS_CDN_WASM_URL}`
    );
  }
  return OFFICIAL_HIGHS_CDN_WASM_URL;
}

/**
 * Get or initialize the HiGHS WebAssembly solver instance.
 * Works seamlessly in Node.js, Web Browsers, and Web Workers.
 */
export async function getHighs(options: SolveOptions = {}): Promise<HighsInstance> {
  if (cachedHighsPromise) {
    return cachedHighsPromise;
  }

  cachedHighsPromise = (async () => {
    // Dynamically import highs to ensure compatibility with ESM / Bundler / Node
    const highsModule = await import("highs");
    const loadHighs = highsModule.default || highsModule;

    const isNode =
      typeof process !== "undefined" &&
      process.versions &&
      process.versions.node &&
      (process as any).type !== "renderer";

    if (isNode) {
      return await loadHighs();
    }

    // Browser or Web Worker environment
    const wasmUrl = await resolveBrowserWasmUrl(options.wasmUrl);

    const highsInstance = await loadHighs({
      locateFile: (file: string) => {
        if (file.endsWith(".wasm")) {
          return wasmUrl;
        }
        return file;
      },
    });

    return highsInstance;
  })();

  return cachedHighsPromise;
}

export interface RawHighsSolveResult {
  Status: string;
  ObjectiveValue: number;
  Columns: Record<string, {
    Index: number;
    Lower: number;
    Upper: number;
    Type: string;
    Primal: number;
    Dual?: number;
    Name: string;
  }>;
  Rows?: Record<string, {
    Index: number;
    Lower: number;
    Upper: number;
    Dual?: number;
    Primal?: number;
    Name: string;
  }>;
}

/**
 * Solve an LP formatted model using HiGHS WASM
 */
export async function solveLpWithHighs(
  lpString: string,
  options: SolveOptions = {}
): Promise<{ result: RawHighsSolveResult; runTime: number }> {
  const highs = await getHighs(options);
  const startTime = performance.now();

  const highsOptions: Record<string, any> = {
    output_flag: options.outputFlag ?? false,
  };

  if (options.timeLimit !== undefined) {
    highsOptions.time_limit = options.timeLimit;
  }
  if (options.presolve !== undefined) {
    highsOptions.presolve = options.presolve;
  }
  if (options.solver !== undefined) {
    highsOptions.solver = options.solver;
  }
  if (options.relGap !== undefined) {
    highsOptions.mip_rel_gap = options.relGap;
  }
  if (options.absGap !== undefined) {
    highsOptions.mip_abs_gap = options.absGap;
  }

  const result = highs.solve(lpString, highsOptions);
  const endTime = performance.now();
  const runTime = (endTime - startTime) / 1000;

  return { result, runTime };
}
