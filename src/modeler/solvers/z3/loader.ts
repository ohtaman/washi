import { getBundledZ3AssetUrls } from "./assets.js";

type Z3Instance = any;

let z3InitPromise: Promise<Z3Instance> | null = null;
let customZ3JsUrl: string | null = null;
let customZ3WasmUrl: string | null = null;
interface Z3Runtime {
  instance: Z3Instance | null;
  error: Error | null;
  bootstrapUrl?: string;
  errorHandlers: Set<(error: Error) => void>;
  asyncRejects: Set<(error: Error) => void>;
}

let currentRuntime: Z3Runtime | null = null;
const instanceRuntimes = new WeakMap<object, Z3Runtime>();

function failRuntime(runtime: Z3Runtime, err: unknown): void {
  if (runtime.error) return;
  const error = err instanceof Error
    ? err
    : new Error(`[WaSHI] Z3 internal worker error: ${typeof err === "object" && err !== null && "message" in err ? String(err.message) : String(err)}`);
  runtime.error = error;

  // Reject the owned async_call so z3-solver's runExclusive finally releases its
  // own mutex. Never cancel/release host locks or modify async-mutex prototypes.
  for (const reject of runtime.asyncRejects) reject(error);
  runtime.asyncRejects.clear();
  if (currentRuntime === runtime) resetZ3LoaderCache();
  try { runtime.instance?.em?.PThread?.terminateAllThreads(); } catch { /* Already disposed. */ }
  if (runtime.bootstrapUrl) URL.revokeObjectURL(runtime.bootstrapUrl);
  for (const handler of Array.from(runtime.errorHandlers)) {
    try { handler(error); } catch { /* One subscriber must not block the others. */ }
  }
  runtime.errorHandlers.clear();
}

function hookEmscriptenAsyncCall(em: any, runtime: Z3Runtime): void {
  if (!em || em.__washi_async_call_hooked) return;
  em.__washi_async_call_hooked = true;

  const originalAsyncCall = em.async_call;
  if (typeof originalAsyncCall !== "function") return;

  em.async_call = function (f: any, ...args: any[]) {
    if (runtime.error) return Promise.reject(runtime.error);
    let rejectFn!: (err: Error) => void;
    const trackerPromise = new Promise<never>((_, reject) => {
      rejectFn = reject;
      runtime.asyncRejects.add(reject);
    });
    // Ensure trackerPromise never triggers unhandledRejection if rejected later
    trackerPromise.catch(() => {});

    try {
      const callPromise = originalAsyncCall.call(this, f, ...args);
      return Promise.race([callPromise, trackerPromise]).finally(() => {
        runtime.asyncRejects.delete(rejectFn);
      });
    } catch (syncErr: any) {
      runtime.asyncRejects.delete(rejectFn);
      failRuntime(runtime, syncErr);
      throw syncErr;
    }
  };
}

export function registerZ3ErrorHandler(handler: (err: Error) => void, instance?: Z3Instance): () => void {
  const runtime = instance ? instanceRuntimes.get(instance) : currentRuntime;
  if (!runtime) return () => {};
  if (runtime.error) {
    handler(runtime.error);
    return () => {};
  }
  runtime.errorHandlers.add(handler);
  return () => { runtime.errorHandlers.delete(handler); };
}

export function notifyZ3WorkerError(err: unknown): void {
  if (currentRuntime) failRuntime(currentRuntime, err);
}

function attachPThreadWorkerErrorHandling(em: any, runtime: Z3Runtime): void {
  if (!em || !em.PThread || em.PThread.__washi_monitored) {
    return;
  }
  em.PThread.__washi_monitored = true;

  const hookWorker = (worker: any) => {
    if (!worker) return;
    worker.onerror = (e: any) => {
      failRuntime(runtime, e);
    };
    if (typeof worker.addEventListener === "function") {
      worker.addEventListener("error", (e: any) => {
        failRuntime(runtime, e);
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
          failRuntime(runtime, e);
        };
        return p;
      } catch (e: any) {
        failRuntime(runtime, e);
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
        failRuntime(runtime, e);
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
  currentRuntime = null;
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
 *
 * @internal
 */
export async function probeAssetUrl(url: string, assetName: string): Promise<void> {
  try {
    let res: Response | null = null;
    try {
      // 1. Prefer lightweight HEAD method first to verify headers without downloading body
      // and without poisoning browser HTTP cache with partial byte ranges.
      const headRes = await fetch(url, { method: "HEAD" });
      if (headRes.ok) {
        res = headRes;
      }
    } catch {
      // Ignore network / CORS errors on HEAD; proceed to fallback GET
    }

    // 2. If HEAD was not successful (e.g. 403 on signed URLs, 405 Method Not Allowed,
    // CORS/network error, or other non-2xx status), fall back to GET with Range and cache: "no-store".
    if (!res) {
      res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-3" },
        cache: "no-store",
      });
    }

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
 *
 * @internal
 */
export async function ensureInitZ3Loaded(jsUrl: string): Promise<any> {
  const globalObj = globalThis as any;
  if (typeof globalObj.global === "undefined") {
    globalObj.global = globalObj;
  }
  if (typeof globalObj.initZ3 === "function") {
    return globalObj.initZ3;
  }

  if (typeof document !== "undefined") {
    await new Promise<void>((resolve, reject) => {
      let scriptError: any = null;

      const normalizeUrl = (u: string): string => {
        try {
          const base = typeof document !== "undefined" && document.baseURI ? document.baseURI : undefined;
          const parsed = new URL(u, base);
          return parsed.origin + parsed.pathname;
        } catch {
          return u;
        }
      };

      const targetPath = normalizeUrl(jsUrl);

      const onErrorEvent = (ev: ErrorEvent) => {
        if (!ev.filename) return;
        const evPath = normalizeUrl(ev.filename);
        if (
          evPath === targetPath ||
          ev.filename === jsUrl ||
          ev.filename.endsWith(targetPath) ||
          targetPath.endsWith(ev.filename)
        ) {
          scriptError = ev.error || ev.message;
        }
      };

      const hasWindowEvents = typeof window !== "undefined" && typeof window.addEventListener === "function";
      if (hasWindowEvents) {
        window.addEventListener("error", onErrorEvent);
      }

      const script = document.createElement("script");
      script.src = jsUrl;
      script.crossOrigin = "anonymous";
      script.onload = () => {
        if (hasWindowEvents) {
          window.removeEventListener("error", onErrorEvent);
        }
        if (typeof globalObj.initZ3 !== "function" && scriptError) {
          const detail =
            scriptError instanceof Error
              ? `${scriptError.name}: ${scriptError.message}`
              : typeof scriptError === "string"
              ? scriptError
              : scriptError?.message
              ? `${scriptError.name ? scriptError.name + ": " : ""}${scriptError.message}`
              : String(scriptError);
          reject(
            new Error(
              `[WaSHI] Failed to evaluate Z3 runtime script from "${jsUrl}": ${detail}`
            )
          );
          return;
        }
        resolve();
      };
      script.onerror = () => {
        if (hasWindowEvents) {
          window.removeEventListener("error", onErrorEvent);
        }
        reject(new Error(`[WaSHI] Failed to load Z3 runtime script from "${jsUrl}".`));
      };
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

  const runtime: Z3Runtime = {
    instance: null,
    error: null,
    errorHandlers: new Set(),
    asyncRejects: new Set(),
  };
  currentRuntime = runtime;

  async function initialize(init: () => Promise<Z3Instance>): Promise<Z3Instance> {
    if (runtime.error) throw runtime.error;
    const instance = await init();
    runtime.instance = instance;
    instanceRuntimes.set(instance, runtime);
    if (runtime.error) {
      try { instance.em?.PThread?.terminateAllThreads(); } catch { /* Already disposed. */ }
      throw runtime.error;
    }
    if (instance.em) {
      attachPThreadWorkerErrorHandling(instance.em, runtime);
      hookEmscriptenAsyncCall(instance.em, runtime);
    }
    return instance;
  }

  let rejectInit!: (error: Error) => void;
  const interrupted = new Promise<never>((_, reject) => { rejectInit = reject; });
  runtime.errorHandlers.add(rejectInit);

  const isNode =
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node &&
    (process as any).type !== "renderer";

  const initializing = (async () => {
    if (isNode) {
      try {
        const z3 = await import("z3-solver");
        return await initialize(() => z3.init());
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
    if (runtime.error) throw runtime.error;

    // Cross-origin worker bootstrap support
    let mainScriptUrlOrBlob = jsUrl;
    if (typeof window !== "undefined" && new URL(jsUrl).origin !== window.location.origin) {
      const bootstrapBlob = new Blob([`importScripts(${JSON.stringify(jsUrl)});`], {
        type: "application/javascript",
      });
      mainScriptUrlOrBlob = URL.createObjectURL(bootstrapBlob);
      runtime.bootstrapUrl = mainScriptUrlOrBlob;
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
      return await initialize(() => z3.init(moduleOverrides));
    } catch (err: any) {
      throw new Error(
        `[WaSHI] Failed to initialize Z3 in browser: ${err?.message || String(err)}`,
        { cause: err }
      );
    }
  })();

  const pending = Promise.race([initializing, interrupted]).finally(() => {
    runtime.errorHandlers.delete(rejectInit);
  });
  pending.catch((error) => failRuntime(runtime, error));

  z3InitPromise = pending;
  return pending;
}

/**
 * Terminate background Z3 worker threads (Node.js and Browser).
 */
export async function killZ3Threads(z3Instance?: any): Promise<void> {
  const runtime = z3Instance ? instanceRuntimes.get(z3Instance) : currentRuntime;
  const instance = z3Instance || runtime?.instance;
  if (runtime) failRuntime(runtime, new Error("[WaSHI] Z3 threads terminated"));
  // A pending init is already rejected; its late instance will be disposed by initialize().
  if (!instance?.em) return;
  try {
    const { killThreads } = await import("z3-solver");
    if (typeof killThreads === "function") {
      await killThreads(instance.em);
    } else {
      instance.em.PThread?.terminateAllThreads();
    }
  } catch {
    instance.em.PThread?.terminateAllThreads();
  }
}
