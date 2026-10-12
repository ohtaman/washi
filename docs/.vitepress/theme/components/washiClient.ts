let cachedWashi: typeof import("../../../../src/index.js") | null = null;
let z3Registered = false;

export async function getWashiClient(needZ3 = false) {
  if (!cachedWashi) {
    cachedWashi = await import("../../../../src/index.js");
  }
  if (needZ3 && !z3Registered) {
    const { registerZ3Solver } = await import("../../../../src/modeler/solvers/z3.js");
    registerZ3Solver();
    z3Registered = true;
  }
  return cachedWashi;
}
