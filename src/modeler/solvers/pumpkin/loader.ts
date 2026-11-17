import { getBundledPumpkinWasmUrl } from "./assets.js";
import initPumpkin, {
  check_json,
  check_with_callback,
  solve_json,
  solve_with_callback,
  __washiResetPumpkinRuntime,
} from "./runtime.js";

export interface PumpkinRuntime {
  check_with_callback: (request_json: string, should_abort?: (() => boolean) | null) => string;
  solve_with_callback: (
    request_json: string,
    on_event?: ((payloadJson: string) => boolean) | null,
    should_abort?: (() => boolean) | null
  ) => string;
  check_json: (request_json: string) => string;
  solve_json: (request_json: string) => string;
}

let customWasmUrl: string | null = null;
let loadedRuntimePromise: Promise<PumpkinRuntime> | null = null;
let loadedRuntimeKey: string | null = null;
let workerResetHook: (() => void) | null = null;

/** Registers an internal callback so updating `wasmUrl` resets any active/idle worker client. */
export function registerPumpkinWorkerResetHook(hook: (() => void) | null): void {
  workerResetHook = hook;
}

function isNodeEnvironment(): boolean {
  return (
    typeof process !== "undefined" &&
    Boolean(process.versions?.node) &&
    process.release?.name === "node"
  );
}

/** Validates standard WASM magic header bytes (`\0asm`). */
export function isValidWasmHeader(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d
  );
}

/**
 * Configure a custom URL (or `file://` URI in Node.js) for `pumpkin.wasm`.
 * Pass `null` to restore WaSHI's bundled WASM binary resolution.
 */
export function setPumpkinWasmUrl(url: string | null): void {
  if (url !== null && typeof url !== "string") {
    throw new Error(`Invalid pumpkin.wasm URL: expected string or null, got ${typeof url}.`);
  }
  const normalized = url === "" ? null : url;
  if (normalized === customWasmUrl) {
    return;
  }
  customWasmUrl = normalized;
  resetPumpkinLoader();
}

/**
 * Returns the custom `pumpkin.wasm` URL if configured, or `null` when using the bundled WASM binary.
 */
export function getPumpkinWasmUrl(): string | null {
  return customWasmUrl;
}

/**
 * Resolves the effective `pumpkin.wasm` URL used in browser and worker environments.
 */
export function resolvePumpkinWasmUrl(): string {
  return customWasmUrl ?? getBundledPumpkinWasmUrl();
}

/**
 * Reset cached WASM runtime state so the next solve/check re-fetches and re-instantiates `pumpkin.wasm`.
 */
export function resetPumpkinLoader(): void {
  loadedRuntimePromise = null;
  loadedRuntimeKey = null;
  __washiResetPumpkinRuntime();
  workerResetHook?.();
}

/**
 * Determines whether Pumpkin should default to running in a browser Web Worker.
 */
export function shouldUseWorker(): boolean {
  if (typeof Worker === "undefined" || typeof window === "undefined") {
    return false;
  }
  // Node/test Worker polyfills often attach Node-specific prototype methods like `unref`
  if (typeof (Worker.prototype as { unref?: unknown }).unref === "function") {
    return false;
  }
  const effectiveOrigin =
    typeof window.origin === "string"
      ? window.origin
      : (() => {
          try {
            return window.location?.origin;
          } catch {
            return undefined;
          }
        })();
  return Boolean(effectiveOrigin && effectiveOrigin !== "null" && !effectiveOrigin.startsWith("file:"));
}

async function fetchValidatedWasmBytes(url: string): Promise<Uint8Array> {
  if (typeof fetch !== "function") {
    throw new Error(
      `[WaSHI] Global fetch() is unavailable to load Pumpkin WebAssembly from "${url}"; no CDN fallback is attempted.`
    );
  }

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(
      `[WaSHI] Failed to fetch pumpkin.wasm from "${url}" (no CDN fallback is attempted): ${
        err instanceof Error ? err.message : String(err)
      }. Ensure pumpkin.wasm is hosted cleanly or call setPumpkinWasmUrl(url).`
    );
  }

  if (!response.ok) {
    throw new Error(
      `[WaSHI] Failed to fetch pumpkin.wasm from "${url}": HTTP ${response.status} ${response.statusText}; no CDN fallback is attempted.`
    );
  }

  const contentType = response.headers?.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      `[WaSHI] Invalid response while loading pumpkin.wasm from "${url}": received HTML ("${contentType}") instead of a WebAssembly binary; no CDN fallback is attempted.`
    );
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isValidWasmHeader(bytes)) {
    throw new Error(
      `[WaSHI] Invalid WebAssembly binary loaded from "${url}": expected \\0asm magic header; no CDN fallback is attempted.`
    );
  }
  return bytes;
}

function normalizeCustomWasmUrl(overrideWasmUrl?: string | null): string | null {
  if (overrideWasmUrl === undefined) {
    return customWasmUrl;
  }
  if (overrideWasmUrl !== null && typeof overrideWasmUrl !== "string") {
    throw new Error(
      `Invalid pumpkin.wasm URL: expected string or null, got ${typeof overrideWasmUrl}.`
    );
  }
  return overrideWasmUrl === "" ? null : overrideWasmUrl;
}

async function loadWasmBytes(targetCustomUrl: string | null): Promise<Uint8Array> {
  if (targetCustomUrl !== null) {
    if (isNodeEnvironment() && targetCustomUrl.startsWith("file://") && typeof fetch !== "function") {
      const { readPumpkinWasmFileUrl } = await import("./node-runtime.js");
      const bytes = await readPumpkinWasmFileUrl(new URL(targetCustomUrl));
      if (!isValidWasmHeader(bytes)) {
        throw new Error(
          `[WaSHI] Invalid WebAssembly binary at "${targetCustomUrl}": expected \\0asm magic header.`
        );
      }
      return bytes;
    }
    if (isNodeEnvironment() && targetCustomUrl.startsWith("file://")) {
      try {
        return await fetchValidatedWasmBytes(targetCustomUrl);
      } catch {
        const { readPumpkinWasmFileUrl } = await import("./node-runtime.js");
        const bytes = await readPumpkinWasmFileUrl(new URL(targetCustomUrl));
        if (!isValidWasmHeader(bytes)) {
          throw new Error(
            `[WaSHI] Invalid WebAssembly binary at "${targetCustomUrl}": expected \\0asm magic header.`
          );
        }
        return bytes;
      }
    }
    return fetchValidatedWasmBytes(targetCustomUrl);
  }

  if (isNodeEnvironment() && typeof window === "undefined") {
    const { readBundledPumpkinWasmBytes } = await import("./node-runtime.js");
    const bytes = await readBundledPumpkinWasmBytes();
    if (!isValidWasmHeader(bytes)) {
      throw new Error(
        `[WaSHI] Bundled pumpkin.wasm on disk has an invalid WebAssembly magic header.`
      );
    }
    return bytes;
  }

  return fetchValidatedWasmBytes(getBundledPumpkinWasmUrl());
}

/**
 * Loads and caches the instantiated Pumpkin WebAssembly runtime without any CDN fallback.
 */
export async function loadPumpkinRuntime(overrideWasmUrl?: string | null): Promise<PumpkinRuntime> {
  const targetCustomUrl = normalizeCustomWasmUrl(overrideWasmUrl);
  const targetKey = targetCustomUrl ?? "__bundled__";

  if (loadedRuntimePromise && loadedRuntimeKey === targetKey) {
    return loadedRuntimePromise;
  }

  if (loadedRuntimeKey !== null && loadedRuntimeKey !== targetKey) {
    loadedRuntimePromise = null;
    loadedRuntimeKey = null;
    __washiResetPumpkinRuntime();
  }

  loadedRuntimeKey = targetKey;
  let pending: Promise<PumpkinRuntime> | null = null;
  pending = (async () => {
    try {
      const wasmBytes = await loadWasmBytes(targetCustomUrl);
      await initPumpkin({ module_or_path: wasmBytes });
      return {
        check_with_callback,
        solve_with_callback,
        check_json,
        solve_json,
      };
    } catch (err) {
      if (loadedRuntimePromise === pending) {
        loadedRuntimePromise = null;
        loadedRuntimeKey = null;
        __washiResetPumpkinRuntime();
      }
      throw err;
    }
  })();

  loadedRuntimePromise = pending;
  return pending;
}
