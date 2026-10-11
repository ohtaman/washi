import type { SolveOptions } from "../../types.js";
import { getBundledWasmUrl } from "./assets.js";
import { loadNodeHighs } from "./node-runtime.js";

export const OFFICIAL_HIGHS_CDN_WASM_URL =
  "https://cdn.jsdelivr.net/npm/highs@1.15.3/build/highs.wasm";

type HighsInstance = any;

let cachedHighsPromise: Promise<HighsInstance> | null = null;
let cachedWasmKey: string | null = null;
let customWasmUrl: string | null = null;

export function setHighsWasmUrl(url: string | null) {
  customWasmUrl = url;
  // Invalidate cache if wasm url changes before load
  cachedHighsPromise = null;
  cachedWasmKey = null;
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
 * - Default resolution uses the package asset, with no probe or external fallback.
 */
export async function resolveBrowserWasmUrl(explicitUrl?: string): Promise<string> {
  if (explicitUrl) {
    return explicitUrl;
  }
  if (customWasmUrl) {
    return customWasmUrl;
  }

  return getBundledWasmUrl();
}

/**
 * Get or initialize the HiGHS WebAssembly solver instance.
 * Works seamlessly in Node.js, Web Browsers, and Web Workers.
 */
export async function getHighs(options: SolveOptions = {}): Promise<HighsInstance> {
  const isNode =
    typeof process !== "undefined" && process.versions?.node &&
    (process as any).type !== "renderer";
  const wasmUrl = isNode ? null : await resolveBrowserWasmUrl(options.wasmUrl);
  const key = wasmUrl ?? "node";
  if (cachedHighsPromise && cachedWasmKey === key) {
    return cachedHighsPromise;
  }

  cachedWasmKey = key;
  const initializing: Promise<HighsInstance> = (async () => {
    // Dynamically import highs to ensure compatibility with ESM / Bundler / Node
    const loadHighs = isNode
      ? await loadNodeHighs()
      : (await import("./browser-runtime.js")).default;

    if (isNode) {
      return await loadHighs();
    }

    // Browser or Web Worker environment
    const highsInstance = await loadHighs({
      locateFile: (file: string) => {
        if (file.endsWith(".wasm")) {
          return wasmUrl!;
        }
        return file;
      },
    });

    return highsInstance;
  })().catch((error) => {
    if (cachedHighsPromise === initializing) {
      cachedHighsPromise = null;
      cachedWasmKey = null;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[WaSHI] Failed to initialize HiGHS${wasmUrl ? ` from "${wasmUrl}"` : ""}. ` +
      `Deploy the package's WASM asset or explicitly set wasmUrl; no CDN fallback is attempted. ${message}`,
      { cause: error },
    );
  });
  cachedHighsPromise = initializing;
  return initializing;
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
