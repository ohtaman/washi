import { Model, expr, maximize, sum } from "@ohtaman/washi";

export interface P078Input {
  courseSizes: number[];
  roomCapacities: number[];
  teachers: number[];
  cohorts: number[][];
  slotScores: number[][];
}

export interface P078Output {
  rooms: number[];
  slots: number[];
  totalScore: number;
}

export async function solve(input: P078Input): Promise<P078Output> {
  // TODO: Build and solve the university timetabling model, then return the output.
  throw new Error("Not implemented");
}
