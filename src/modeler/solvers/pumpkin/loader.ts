import { getBundledPumpkinWasmUrl } from "./assets.js";
import { createPumpkinRuntime } from "./runtime.js";

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

const MAX_CACHED_RUNTIMES = 4;
let customWasmUrl: string | null = null;
const runtimeCache = new Map<string, Promise<PumpkinRuntime>>();
const readyRuntimeKeys = new Set<string>();
let resetEpoch = 0;
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
  if (url === "") {
    throw new Error(
      'Invalid pumpkin.wasm URL: expected non-empty string or null (received empty string "").'
    );
  }
  if (url === customWasmUrl) {
    return;
  }
  customWasmUrl = url;
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
  resetEpoch++;
  runtimeCache.clear();
  readyRuntimeKeys.clear();
  workerResetHook?.();
}

/**
 * Returns `true` when an instantiated main-thread Pumpkin WASM runtime is cached for the resolved URL.
 */
export function isPumpkinRuntimeCached(overrideWasmUrl?: string | null): boolean {
  const targetKey = normalizeCustomWasmUrl(overrideWasmUrl) ?? "__bundled__";
  return readyRuntimeKeys.has(targetKey);
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
  if (overrideWasmUrl === "") {
    throw new Error(
      'Invalid pumpkin.wasm URL: expected non-empty string or null (received empty string "").'
    );
  }
  return overrideWasmUrl;
}

async function loadWasmBytes(targetCustomUrl: string | null): Promise<Uint8Array> {
  if (targetCustomUrl !== null) {
    if (isNodeEnvironment() && targetCustomUrl.startsWith("file://")) {
      const { readPumpkinWasmFileUrl } = await import("./node-runtime.js");
      const bytes = await readPumpkinWasmFileUrl(new URL(targetCustomUrl));
      if (!isValidWasmHeader(bytes)) {
        throw new Error(
          `[WaSHI] Invalid WebAssembly binary at "${targetCustomUrl}": expected \\0asm magic header.`
        );
      }
      return bytes;
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
 * Loads and caches an isolated Pumpkin WebAssembly runtime per target URL without any CDN fallback.
 */
export async function loadPumpkinRuntime(overrideWasmUrl?: string | null): Promise<PumpkinRuntime> {
  const targetCustomUrl = normalizeCustomWasmUrl(overrideWasmUrl);
  const targetKey = targetCustomUrl ?? "__bundled__";

  const cached = runtimeCache.get(targetKey);
  if (cached) {
    runtimeCache.delete(targetKey);
    runtimeCache.set(targetKey, cached);
    return cached;
  }

  const capturedEpoch = resetEpoch;
  let pending: Promise<PumpkinRuntime> | null = null;
  pending = (async () => {
    try {
      const wasmBytes = await loadWasmBytes(targetCustomUrl);
      const rt = await createPumpkinRuntime(wasmBytes);
      if (resetEpoch === capturedEpoch && runtimeCache.get(targetKey) === pending) {
        readyRuntimeKeys.add(targetKey);
      }
      return rt;
    } catch (err) {
      if (resetEpoch === capturedEpoch) {
        readyRuntimeKeys.delete(targetKey);
        if (runtimeCache.get(targetKey) === pending) {
          runtimeCache.delete(targetKey);
        }
      }
      if (
        targetCustomUrl !== null &&
        err instanceof Error &&
        err.message.includes("Invalid Pumpkin WebAssembly module")
      ) {
        throw new Error(
          `[WaSHI] Invalid Pumpkin WebAssembly module loaded from "${targetCustomUrl}" (${err.message}); no CDN fallback is attempted.`
        );
      }
      throw err;
    }
  })();

  while (runtimeCache.size >= MAX_CACHED_RUNTIMES) {
    const oldestKey = runtimeCache.keys().next().value;
    if (oldestKey === undefined) break;
    runtimeCache.delete(oldestKey);
    readyRuntimeKeys.delete(oldestKey);
  }
  runtimeCache.set(targetKey, pending);
  return pending;
}
