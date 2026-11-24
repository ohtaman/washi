export interface P000Input {
  a: number;
  b: number;
}

export interface P000Output {
  sum: number;
}

export async function solve(input: P000Input): Promise<P000Output> {
  // Tutorial warm-up: compute the sum directly without an optimization model.
  return { sum: input.a + input.b };
}
