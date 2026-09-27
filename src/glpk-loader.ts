/**
 * Loader for GLPK (GNU Linear Programming Kit) WebAssembly / JS engine.
 * Supports both Node.js (glpk.js/node) and modern browsers (glpk.js worker).
 */

type GlpkInstance = any;

let cachedGlpkPromise: Promise<GlpkInstance> | null = null;

export async function getGlpk(): Promise<GlpkInstance> {
  if (cachedGlpkPromise) {
    return cachedGlpkPromise;
  }

  cachedGlpkPromise = (async () => {
    const isNode =
      typeof process !== "undefined" &&
      process.versions &&
      process.versions.node &&
      (process as any).type !== "renderer";

    if (isNode) {
      // In Node.js environment: load the synchronous glpk.js/node build
      const mod = await import("glpk.js/node");
      const loadGlpk = mod.default || mod;
      return await loadGlpk();
    }

    // In Browser environment: load default glpk.js build
    const mod = await import("glpk.js");
    const loadGlpk = mod.default || mod;
    return await loadGlpk();
  })();

  return cachedGlpkPromise;
}
