import type { Solver, SolverOptions } from "./types.js";
import { HighsSolver } from "./highs.js";
import { MockSolver } from "./mock.js";

type SolverFactory = (options?: SolverOptions) => Solver;

const solverRegistry = new Map<string, SolverFactory>();

// Register default built-in solvers
solverRegistry.set("highs", (opts) => new HighsSolver(opts));
solverRegistry.set("mock", (opts) => new MockSolver(opts));

let defaultSolverFactory: SolverFactory = (opts) => new HighsSolver(opts);

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
    defaultSolverFactory = factory;
  } else if (typeof solverOrName === "function") {
    defaultSolverFactory = solverOrName;
  } else {
    defaultSolverFactory = () => solverOrName;
  }
}

/**
 * Get an instance of a solver by name or instance
 */
export function getSolver(solverOrName?: string | Solver, options?: SolverOptions): Solver {
  if (!solverOrName) {
    return defaultSolverFactory(options);
  }

  if (typeof solverOrName === "string") {
    const factory = solverRegistry.get(solverOrName.toLowerCase());
    if (!factory) {
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
