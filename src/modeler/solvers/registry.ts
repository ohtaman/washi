import type { Solver, SolverOptions } from "./types.js";

export type SolverFactory = (options?: SolverOptions) => Solver;

const REGISTRY_KEY = Symbol.for("washi.solverRegistry");
const DEFAULT_FACTORY_KEY = Symbol.for("washi.defaultSolverFactory");

const globalScope = globalThis as any;
if (!globalScope[REGISTRY_KEY]) {
  globalScope[REGISTRY_KEY] = new Map<string, SolverFactory>();
}

const solverRegistry: Map<string, SolverFactory> = globalScope[REGISTRY_KEY];

/**
 * Register a new solver factory by name
 */
export function registerSolver(name: string, factory: SolverFactory): void {
  solverRegistry.set(name.toLowerCase(), factory);
}

/**
 * Set the default solver used when no solver is specified
 */
export function setDefaultSolver(solverOrName: string | SolverFactory | Solver): void {
  if (typeof solverOrName === "string") {
    const factory = solverRegistry.get(solverOrName.toLowerCase());
    if (!factory) {
      throw new Error(`Solver '${solverOrName}' is not registered.`);
    }
    globalScope[DEFAULT_FACTORY_KEY] = factory;
  } else if (typeof solverOrName === "function") {
    globalScope[DEFAULT_FACTORY_KEY] = solverOrName;
  } else {
    globalScope[DEFAULT_FACTORY_KEY] = () => solverOrName;
  }
}

/**
 * Get an instance of a solver by name or instance
 */
export function getSolver(solverOrName?: string | Solver, options?: SolverOptions): Solver {
  if (!solverOrName) {
    const defaultFactory: SolverFactory | undefined = globalScope[DEFAULT_FACTORY_KEY] || solverRegistry.get("highs");
    if (!defaultFactory) {
      throw new Error(`No default solver available. Available solvers: ${listAvailableSolvers().join(", ")}`);
    }
    return defaultFactory(options);
  }

  if (typeof solverOrName === "string") {
    const lowerName = solverOrName.toLowerCase();
    const factory = solverRegistry.get(lowerName);
    if (!factory) {
      if (lowerName === "glpk") {
        throw new Error(
          `Solver 'glpk' not found. Available solvers: ${listAvailableSolvers().join(", ")}. ` +
          `Please import '@ohtaman/washi/solvers/glpk' before selecting this solver.`
        );
      }
      if (lowerName === "z3") {
        throw new Error(
          `Solver 'z3' not found. Available solvers: ${listAvailableSolvers().join(", ")}. ` +
          `Please import '@ohtaman/washi/solvers/z3' before selecting this solver.`
        );
      }
      throw new Error(
        `Solver '${solverOrName}' not found. Available solvers: ${listAvailableSolvers().join(", ")}`
      );
    }
    return factory(options);
  }

  return solverOrName;
}

/**
 * List all registered solver names
 */
export function listAvailableSolvers(): string[] {
  return Array.from(solverRegistry.keys());
}
