import { Model, expr, minimize, sum } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P038Input {
  numHosts: number;
  capacity: number;
  sizes: number[];
  conflicts: number[][];
}

export interface P038Output {
  hosts: number[];
  usedHosts: number;
}

export async function solve(input: P038Input): Promise<P038Output> {
  const n = input.sizes.length;
  const K = input.numHosts;
  const hostIndices = Array.from({ length: K }, (_, k) => k);
  const m = new Model("HostPackingSymmetry");

  const hosts = m.integer(n, { lb: 0, ub: K - 1, prefix: "host" });
  const assign = input.sizes.map((_, i) => m.binary(K, { prefix: `assign_${i}` }));
  const load = m.integer(K, { lb: 0, ub: input.capacity, prefix: "load" });
  const used = m.binary(K, { prefix: "used" });

  m.constraint(assign.map((row) => expr`sum(${row}) == 1`));
  m.constraint(
    assign.map((row, i) => expr`dot(${hostIndices}, ${row}) == ${hosts[i]}`)
  );
  m.constraint(
    load.map(
      (ld, k) => expr`dot(${input.sizes}, ${assign.map((row) => row[k])}) == ${ld}`
    )
  );
  m.constraint(load.map((ld, k) => expr`${ld} <= ${input.capacity} * ${used[k]}`));
  m.constraint(load.map((ld, k) => expr`${ld} >= ${used[k]}`));

  m.constraint(
    input.conflicts.map(([u, v]) => expr`${hosts[u]} != ${hosts[v]}`)
  );

  // Symmetry breaking over identical hosts: active prefix + non-increasing host loads
  m.constraint(used.slice(0, -1).map((u, k) => expr`${u} >= ${used[k + 1]}`));
  m.constraint(load.slice(0, -1).map((ld, k) => expr`${ld} >= ${load[k + 1]}`));

  m.objective(minimize(sum(used)));
  await m.solve({ solver: "pumpkin" });

  return {
    hosts: hosts.map((v) => Math.round(v.value!) || 0),
    usedHosts: Math.round(m.objectiveValue!) || 0,
  };
}
