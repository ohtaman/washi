import { getBundledZ3AssetUrls } from "./assets.js";

type Z3Instance = any;

let z3InitPromise: Promise<Z3Instance> | null = null;
let currentZ3Instance: any = null;
let customZ3JsUrl: string | null = null;
let customZ3WasmUrl: string | null = null;
const activeErrorHandlers = new Set<(err: Error) => void>();
const activeAsyncRejects = new Set<(err: Error) => void>();
const trackedSemaphores = new Set<any>();

function hookAsyncMutex(mod: any): void {
  const Semaphore = mod?.Semaphore || mod?.default?.Semaphore;
  if (!Semaphore || Semaphore.__washi_hooked) return;
  Semaphore.__washi_hooked = true;

  const originalAcquire = Semaphore.prototype.acquire;
  Semaphore.prototype.acquire = function (...args: any[]) {
    trackedSemaphores.add(this);
    return originalAcquire.apply(this, args);
  };
}

// Proactively hook async-mutex if available in the current environment
import("async-mutex").then(hookAsyncMutex).catch(() => {});

export function unlockAllZ3Semaphores(error?: Error): void {
  for (const sem of Array.from(trackedSemaphores)) {
    try {
      if (typeof sem.isLocked === "function" && sem.isLocked()) {
        if (typeof sem.cancel === "function") {
          try { sem.cancel(); } catch (_) {}
        }
        if (typeof sem.release === "function") {
          try { sem.release(); } catch (_) {}
        }
      }
    } catch (_) {}
  }
}

function hookEmscriptenAsyncCall(em: any): void {
  if (!em || em.__washi_async_call_hooked) return;
  em.__washi_async_call_hooked = true;

  const originalAsyncCall = em.async_call;
  if (typeof originalAsyncCall !== "function") return;

  em.async_call = function (f: any, ...args: any[]) {
    let rejectFn!: (err: Error) => void;
    const trackerPromise = new Promise<never>((_, reject) => {
      rejectFn = reject;
      activeAsyncRejects.add(reject);
    });
    // Ensure trackerPromise never triggers unhandledRejection if rejected later
    trackerPromise.catch(() => {});

    try {
      const callPromise = originalAsyncCall.call(this, f, ...args);
      return Promise.race([callPromise, trackerPromise]).finally(() => {
        activeAsyncRejects.delete(rejectFn);
      });
    } catch (syncErr: any) {
      activeAsyncRejects.delete(rejectFn);
      notifyZ3WorkerError(syncErr);
      throw syncErr;
    }
  };
}

export function registerZ3ErrorHandler(handler: (err: Error) => void): () => void {
  activeErrorHandlers.add(handler);
  return () => { activeErrorHandlers.delete(handler); };
}

export function notifyZ3WorkerError(err: any): void {
  const error = err instanceof Error
    ? err
    : new Error(`[WaSHI] Z3 internal worker error: ${err?.message || (typeof err === "string" ? err : "Worker failed to initialize or execute")}`);

  // 1. Immediately reject pending Emscripten async_call operations so low-level wrapper throws inside runExclusive
  for (const reject of Array.from(activeAsyncRejects)) {
    try { reject(error); } catch (_) {}
  }
  activeAsyncRejects.clear();

  // 2. Unlock / cancel any locked async-mutex semaphores as safety net
  unlockAllZ3Semaphores(error);

  // 3. Terminate worker threads immediately
  if (currentZ3Instance?.em?.PThread?.terminateAllThreads) {
    try { currentZ3Instance.em.PThread.terminateAllThreads(); } catch (_) {}
  }
  // 4. Invalidate cached loader instance
  resetZ3LoaderCache();

  // 5. Notify and reject all active check() / solve() operations
  for (const handler of Array.from(activeErrorHandlers)) {
    try { handler(error); } catch (_) {}
  }
}

function attachPThreadWorkerErrorHandling(em: any): void {
  if (!em || !em.PThread || em.PThread.__washi_monitored) {
    return;
  }
  em.PThread.__washi_monitored = true;

  const hookWorker = (worker: any) => {
    if (!worker) return;
    worker.onerror = (e: any) => {
      notifyZ3WorkerError(e);
    };
    if (typeof worker.addEventListener === "function") {
      worker.addEventListener("error", (e: any) => {
        notifyZ3WorkerError(e);
        if (typeof e.preventDefault === "function") {
          e.preventDefault();
        }
      });
    }
  };

  if (Array.isArray(em.PThread.unusedWorkers)) {
    em.PThread.unusedWorkers.forEach(hookWorker);
  }
  if (Array.isArray(em.PThread.runningWorkers)) {
    em.PThread.runningWorkers.forEach(hookWorker);
  }

  const originalLoad = em.PThread.loadWasmModuleToWorker;
  if (typeof originalLoad === "function") {
    em.PThread.loadWasmModuleToWorker = function (worker: any) {
      try {
        const p = originalLoad.call(this, worker);
        // originalLoad sets worker.onerror = (e) => throw e;
        // We override it immediately after originalLoad.call to prevent unhandled throws,
        // notify active solve/check promises, and clean up threads:
        worker.onerror = (e: any) => {
          notifyZ3WorkerError(e);
        };
        return p;
      } catch (e: any) {
        notifyZ3WorkerError(e);
        throw e;
      }
    };
  }

  const originalAllocate = em.PThread.allocateUnusedWorker;
  if (typeof originalAllocate === "function") {
    em.PThread.allocateUnusedWorker = function () {
      try {
        originalAllocate.call(this);
        const worker = this.unusedWorkers?.[this.unusedWorkers.length - 1];
        if (worker) {
          hookWorker(worker);
        }
      } catch (e: any) {
        notifyZ3WorkerError(e);
        throw e;
      }
    };
  }
}

/**
 * Configure explicit URLs for Z3 assets (z3-built.js and z3-built.wasm).
 */
export function setZ3Assets(urls: { jsUrl?: string | null; wasmUrl?: string | null }): void {
  if (urls.jsUrl !== undefined) customZ3JsUrl = urls.jsUrl;
  if (urls.wasmUrl !== undefined) customZ3WasmUrl = urls.wasmUrl;
  resetZ3LoaderCache();
}

/**
 * Reset cached Z3 initialization promise and instance (for testing and retry).
 */
export function resetZ3LoaderCache(): void {
  z3InitPromise = null;
  currentZ3Instance = null;
}

/**
 * Validate browser environment prerequisites for multithreaded Z3 WASM.
 */
export function validateZ3BrowserEnvironment(): void {
  if (typeof window === "undefined") {
    return;
  }

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]";

  if (!window.isSecureContext && !isLocalhost) {
    throw new Error(
      `[WaSHI] Z3 solver requires a Secure Context (HTTPS or localhost). Current protocol: "${window.location.protocol}".`
    );
  }

  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
  const isCrossOriginIsolated = (window as any).crossOriginIsolated === true;

  if (!hasSharedArrayBuffer || !isCrossOriginIsolated) {
    throw new Error(
      `[WaSHI] Z3 solver requires SharedArrayBuffer and crossOriginIsolated in browser environments.\n` +
      `Ensure your server sends the following delivery headers on the document response:\n` +
      `  Cross-Origin-Opener-Policy: same-origin\n` +
      `  Cross-Origin-Embedder-Policy: require-corp\n` +
      `(Note: Standard CORS headers alone are not sufficient, and setting 'useWorker: false' does not remove Z3's internal multithreading requirement.)`
    );
  }
}

/**
 * Probe an asset URL to verify it returns a valid response (not 404 and not HTML SPA fallback).
 */
async function probeAssetUrl(url: string, assetName: string): Promise<void> {
  try {
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-3" } });
    if (!res.ok) {
      throw new Error(`server responded with HTTP status ${res.status} (${res.statusText || "Not Found"})`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      throw new Error(`server responded with "text/html" instead of expected ${assetName} (check SPA fallback routing)`);
    }
  } catch (err: any) {
    throw new Error(
      `[WaSHI] Failed to load Z3 asset (${assetName}) from "${url}": ${err.message || String(err)}. ` +
      `Deploy local assets with correct MIME types; no CDN fallback is attempted.`,
      { cause: err }
    );
  }
}

/**
 * Resolve asset URLs for z3-built.js and z3-built.wasm in browser environments.
 */
export function resolveZ3AssetUrls(options: { z3JsUrl?: string; z3WasmUrl?: string; [key: string]: any } = {}): { jsUrl: string; wasmUrl: string } {
  if (options.z3JsUrl && options.z3WasmUrl) {
    return { jsUrl: options.z3JsUrl, wasmUrl: options.z3WasmUrl };
  }

  if (customZ3JsUrl && customZ3WasmUrl) {
    return {
      jsUrl: options.z3JsUrl || customZ3JsUrl,
      wasmUrl: options.z3WasmUrl || customZ3WasmUrl,
    };
  }

  const bundled = getBundledZ3AssetUrls();
  return {
    jsUrl: options.z3JsUrl || customZ3JsUrl || bundled.jsUrl,
    wasmUrl: options.z3WasmUrl || customZ3WasmUrl || bundled.wasmUrl,
  };
}

/**
 * Dynamically load z3-built.js script in browser to register global initZ3
 */
async function ensureInitZ3Loaded(jsUrl: string): Promise<any> {
  const globalObj = globalThis as any;
  if (typeof globalObj.global === "undefined") {
    globalObj.global = globalObj;
  }
  if (typeof globalObj.initZ3 === "function") {
    return globalObj.initZ3;
  }

  if (typeof document !== "undefined") {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = jsUrl;
      script.crossOrigin = "anonymous";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`[WaSHI] Failed to load Z3 runtime script from "${jsUrl}".`));
      document.head.appendChild(script);
    });
  } else if (typeof (globalThis as any).importScripts === "function") {
    (globalThis as any).importScripts(jsUrl);
  } else {
    throw new Error("[WaSHI] Cannot load z3-built.js in this environment: neither document nor importScripts is available.");
  }

  if (typeof globalObj.initZ3 !== "function") {
    throw new Error(`[WaSHI] Script loaded from "${jsUrl}" did not define global initZ3.`);
  }

  return globalObj.initZ3;
}

/**
 * Load and initialize Z3 theorem prover.
 */
export async function loadZ3(options: { z3JsUrl?: string; z3WasmUrl?: string; [key: string]: any } = {}): Promise<Z3Instance> {
  if (z3InitPromise) {
    return z3InitPromise;
  }

  const isNode =
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node &&
    (process as any).type !== "renderer";

  const pending = (async () => {
    if (isNode) {
      try {
        const z3 = await import("z3-solver");
        try {
          const asyncMutexMod = await import("async-mutex");
          hookAsyncMutex(asyncMutexMod);
        } catch (_) {}
        const instance = await z3.init();
        currentZ3Instance = instance;
        if (instance && instance.em) {
          attachPThreadWorkerErrorHandling(instance.em);
          hookEmscriptenAsyncCall(instance.em);
        }
        return instance;
      } catch (err: any) {
        throw new Error(
          `[WaSHI] Failed to load z3-solver. Ensure the optional dependency is installed (npm install z3-solver) and supported in this environment. Error: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { cause: err }
        );
      }
    }

    // Browser environment
    validateZ3BrowserEnvironment();
    const { jsUrl, wasmUrl } = resolveZ3AssetUrls(options);

    // Probe JS and WASM URLs for 404 or SPA HTML fallback
    await probeAssetUrl(jsUrl, "JavaScript (z3-built.js)");
    await probeAssetUrl(wasmUrl, "WebAssembly (z3-built.wasm)");

    // Ensure initZ3 is defined
    await ensureInitZ3Loaded(jsUrl);

    // Cross-origin worker bootstrap support
    let mainScriptUrlOrBlob = jsUrl;
    if (typeof window !== "undefined" && new URL(jsUrl).origin !== window.location.origin) {
      const bootstrapBlob = new Blob([`importScripts(${JSON.stringify(jsUrl)});`], {
        type: "application/javascript",
      });
      mainScriptUrlOrBlob = URL.createObjectURL(bootstrapBlob);
    }

    const moduleOverrides = {
      locateFile: (file: string) => {
        if (file.endsWith(".wasm")) {
          return wasmUrl;
        }
        return new URL(file, jsUrl).href;
      },
      mainScriptUrlOrBlob,
    };

    try {
      const z3 = await import("z3-solver");
      try {
        const asyncMutexMod = await import("async-mutex");
        hookAsyncMutex(asyncMutexMod);
      } catch (_) {}
      let unregister: (() => void) | undefined;
      const instance = await new Promise<any>((resolve, reject) => {
        unregister = registerZ3ErrorHandler(reject);
        z3.init(moduleOverrides).then(resolve, reject);
      }).finally(() => unregister?.());

      currentZ3Instance = instance;
      if (instance && instance.em) {
        attachPThreadWorkerErrorHandling(instance.em);
        hookEmscriptenAsyncCall(instance.em);
      }
      return instance;
    } catch (err: any) {
      resetZ3LoaderCache();
      throw new Error(
        `[WaSHI] Failed to initialize Z3 in browser: ${err?.message || String(err)}`,
        { cause: err }
      );
    }
  })();

  pending.catch(() => {
    if (z3InitPromise === pending) {
      resetZ3LoaderCache();
    }
  });

  z3InitPromise = pending;
  return pending;
}

/**
 * Terminate background Z3 worker threads (Node.js and Browser).
 */
export async function killZ3Threads(z3Instance?: any): Promise<void> {
  const instance = z3Instance || currentZ3Instance || (z3InitPromise ? await z3InitPromise.catch(() => null) : null);
  unlockAllZ3Semaphores();
  for (const reject of Array.from(activeAsyncRejects)) {
    try { reject(new Error("[WaSHI] Z3 threads terminated")); } catch (_) {}
  }
  activeAsyncRejects.clear();

  if (!instance || !instance.em) {
    resetZ3LoaderCache();
    return;
  }

  try {
    const { killThreads } = await import("z3-solver");
    if (typeof killThreads === "function") {
      await killThreads(instance.em);
    } else if (instance.em?.PThread?.terminateAllThreads) {
      instance.em.PThread.terminateAllThreads();
    }
  } catch {
    if (instance.em?.PThread?.terminateAllThreads) {
      instance.em.PThread.terminateAllThreads();
    }
  } finally {
    resetZ3LoaderCache();
  }
}

