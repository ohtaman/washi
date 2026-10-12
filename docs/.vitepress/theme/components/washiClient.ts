let cachedWashi: typeof import("../../../../src/index.js") | null = null;
let z3Registered = false;

export async function getWashiClient(needZ3 = false) {
  if (!cachedWashi) {
    cachedWashi = await import("../../../../src/index.js");
  }
  if (needZ3 && !z3Registered) {
    const { registerZ3Solver, setZ3Assets } = await import("../../../../src/modeler/solvers/z3/index.ts");
    if (typeof window !== "undefined") {
      setZ3Assets({
        jsUrl: new URL("/washi/z3-built.js", window.location.origin).href,
        wasmUrl: new URL("/washi/z3-built.wasm", window.location.origin).href,
      });
    }
    registerZ3Solver();
    z3Registered = true;
  }
  return cachedWashi;
}
