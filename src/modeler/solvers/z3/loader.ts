/**
 * Loader for Z3 SMT / SAT / MIP Solver (z3-solver WebAssembly / pthread engine).
 * 
 * In Node.js: Uses node filesystem / worker_threads via z3-solver native bindings.
 * In Browsers: Uses z3-built.js and z3-built.wasm with SharedArrayBuffer and cross-origin isolation.
 */

type Z3Instance = any;

let z3InitPromise: Promise<Z3Instance> | null = null;
let customZ3JsUrl: string | null = null;
let customZ3WasmUrl: string | null = null;
let capturedPluginScriptUrl: string | null = null;

// Capture plugin script URL synchronously at module load time (for classic script tags)
if (typeof document !== "undefined" && document.currentScript) {
  const src = (document.currentScript as HTMLScriptElement).src;
  if (src) {
    capturedPluginScriptUrl = src;
  }
}

/**
 * Configure explicit URLs for Z3 assets (z3-built.js and z3-built.wasm).
 */
export function setZ3Assets(urls: { jsUrl?: string | null; wasmUrl?: string | null }): void {
  if (urls.jsUrl !== undefined) customZ3JsUrl = urls.jsUrl;
  if (urls.wasmUrl !== undefined) customZ3WasmUrl = urls.wasmUrl;
  z3InitPromise = null;
}

/**
 * Reset cached Z3 initialization promise and instance (for testing and retry).
 */
export function resetZ3LoaderCache(): void {
  z3InitPromise = null;
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

  // Determine base URL
  let base: string;
  if (capturedPluginScriptUrl) {
    base = new URL(".", capturedPluginScriptUrl).href;
  } else if (typeof import.meta !== "undefined" && import.meta.url) {
    base = new URL(".", import.meta.url).href;
  } else if (typeof window !== "undefined" && window.location) {
    base = window.location.href;
  } else {
    base = "./";
  }

  const jsUrl = options.z3JsUrl || customZ3JsUrl || new URL("./z3-built.js", base).href;
  const wasmUrl = options.z3WasmUrl || customZ3WasmUrl || new URL("./z3-built.wasm", base).href;

  return { jsUrl, wasmUrl };
}

/**
 * Dynamically load z3-built.js script in browser to register global initZ3
 */
async function ensureInitZ3Loaded(jsUrl: string): Promise<any> {
  const globalObj = globalThis as any;
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
        return await z3.init();
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
      return await z3.init(moduleOverrides);
    } catch (err: any) {
      throw new Error(
        `[WaSHI] Failed to initialize Z3 in browser: ${err?.message || String(err)}`,
        { cause: err }
      );
    }
  })();

  pending.catch(() => {
    if (z3InitPromise === pending) {
      z3InitPromise = null;
    }
  });

  z3InitPromise = pending;
  return pending;
}

/**
 * Terminate background Z3 worker threads (Node.js and Browser).
 */
export async function killZ3Threads(z3Instance?: any): Promise<void> {
  const instance = z3Instance || (z3InitPromise ? await z3InitPromise.catch(() => null) : null);
  if (!instance || !instance.em) {
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
    z3InitPromise = null;
  }
}
