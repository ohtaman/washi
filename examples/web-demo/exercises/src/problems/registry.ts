import type { ProblemDefinition } from "../types.js";
import { CH00_PROBLEMS } from "./ch00-tutorial/index.js";
import { CH01_PROBLEMS } from "./ch01-modeling-basics/index.js";
import { CH02_PROBLEMS } from "./ch02-mip-formulation-idioms/index.js";
import { CH03_PROBLEMS } from "./ch03-linearization-duality/index.js";
import { CH04_PROBLEMS } from "./ch04-constraint-programming/index.js";
import { CH05_PROBLEMS } from "./ch05-propositional-smt-diagnosis/index.js";
import { CH06_PROBLEMS } from "./ch06-networks-routing/index.js";
import { CH07_PROBLEMS } from "./ch07-supply-chain-energy/index.js";
import { CH08_PROBLEMS } from "./ch08-scheduling-rostering/index.js";
export { CHAPTERS } from "./chapters.js";

export const PROBLEMS: ProblemDefinition[] = [
  ...CH00_PROBLEMS,
  ...CH01_PROBLEMS,
  ...CH02_PROBLEMS,
  ...CH03_PROBLEMS,
  ...CH04_PROBLEMS,
  ...CH05_PROBLEMS,
  ...CH06_PROBLEMS,
  ...CH07_PROBLEMS,
  ...CH08_PROBLEMS,
];

export function getProblemById(id: string): ProblemDefinition | undefined {
  return PROBLEMS.find((p) => p.meta.id === id);
}
