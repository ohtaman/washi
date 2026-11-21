import { Model, expr, minimize, sum } from "@ohtaman/washi";

export interface P077Input {
  demands: number[][];
  isSenior: number[];
  staffSkills: number[][];
  skillDemands: number[][];
  ngPairs: number[][];
  shiftCosts: number[][];
}

export interface P077Output {
  schedule: number[][];
  totalCost: number;
}

export async function solve(input: P077Input): Promise<P077Output> {
  // TODO: Build and solve the skill-tiered rostering model, then return the output.
  throw new Error("Not implemented");
}
