import type { ProblemDefinition } from "../types.js";
import { CH00_PROBLEMS } from "./ch00-tutorial/index.js";
import { CH01_PROBLEMS } from "./ch01-modeling-basics/index.js";
import { CH02_PROBLEMS } from "./ch02-mip-formulation-idioms/index.js";
export { CHAPTERS } from "./chapters.js";

export const PROBLEMS: ProblemDefinition[] = [
  ...CH00_PROBLEMS,
  ...CH01_PROBLEMS,
  ...CH02_PROBLEMS,
];

export function getProblemById(id: string): ProblemDefinition | undefined {
  return PROBLEMS.find((p) => p.meta.id === id);
}
