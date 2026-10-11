/**
 * Loader for GLPK (GNU Linear Programming Kit) WebAssembly / JS engine.
 * Supports both Node.js (glpk.js/node) and modern browsers (glpk.js worker).
 */

type GlpkInstance = any;

let cachedGlpkPromise: Promise<GlpkInstance> | null = null;
let currentGlpkInstance: GlpkInstance | null = null;

export async function getGlpk(): Promise<GlpkInstance> {
  if (cachedGlpkPromise) {
    return cachedGlpkPromise;
  }

  const pending = (async () => {
    const isNode =
      typeof process !== "undefined" &&
      process.versions &&
      process.versions.node &&
      (process as any).type !== "renderer";

    try {
      if (isNode) {
        // Do not make web consumers resolve the Node-only optional peer.
        const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ "glpk.js/node");
        const loadGlpk = mod.default || mod;
        const instance = await loadGlpk();
        currentGlpkInstance = instance;
        return instance;
      }

      // Keep the optional import inside try so an absent peer is not a build error.
      const mod = await import("glpk.js");
      const loadGlpk = mod.default || mod;
      const instance = await loadGlpk();
      currentGlpkInstance = instance;
      return instance;
    } catch (error) {
      throw new Error(
        "[WaSHI] Could not load GLPK. Install the optional glpk.js dependency before selecting this solver.",
        { cause: error }
      );
    }
  })();

  pending.catch(() => {
    if (cachedGlpkPromise === pending) {
      cachedGlpkPromise = null;
      currentGlpkInstance = null;
    }
  });

  cachedGlpkPromise = pending;
  return pending;
}

/**
 * Terminate GLPK Worker if active and reset cached instance.
 */
export function terminateGlpk(): void {
  if (currentGlpkInstance && typeof currentGlpkInstance.terminate === "function") {
    try {
      currentGlpkInstance.terminate();
    } catch {
      // ignore
    }
  }
  currentGlpkInstance = null;
  cachedGlpkPromise = null;
}

/**
 * Reset cached GLPK loader promise (for testing and retry).
 */
export function resetGlpkCache(): void {
  terminateGlpk();
}
