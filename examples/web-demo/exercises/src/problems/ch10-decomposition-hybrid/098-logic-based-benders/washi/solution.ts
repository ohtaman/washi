import { Model, BendersCut, Var, disjoint, expr, minimize, sum } from "@ohtaman/washi";

export interface P098Input {
  costs: number[][];
  durations: number[];
  releaseTimes: number[];
  deadlines: number[];
  horizon: number;
}

export interface P098Output {
  assignments: number[];
  starts: number[];
  totalCost: number;
}

async function checkMachineSchedule(
  input: P098Input,
  jobs: number[]
): Promise<{ sat: boolean; starts: Map<number, number> }> {
  const starts = new Map<number, number>();
  if (jobs.length === 0) return { sat: true, starts };

  const sub = new Model("MachineCpSub");
  const vars = new Map<number, Var>();
  for (const j of jobs) {
    const lb = input.releaseTimes[j];
    const ub = Math.min(input.deadlines[j], input.horizon) - input.durations[j];
    if (ub < lb) {
      return { sat: false, starts };
    }
    vars.set(j, sub.integer(`s_${j}`, { lb, ub }));
  }

  if (jobs.length >= 2) {
    sub.constraint(
      disjoint(
        jobs.map((j) => ({
          start: vars.get(j)!,
          duration: input.durations[j],
        }))
      ),
      "no_overlap"
    );
  }

  const res = await sub.check({ solver: "pumpkin" });
  if (res.status !== "Sat") {
    return { sat: false, starts };
  }

  for (const j of jobs) {
    const v = vars.get(j)!;
    const val = res.values[v.name] ?? v.value ?? input.releaseTimes[j];
    starts.set(j, Math.round(val));
  }
  return { sat: true, starts };
}

export async function solve(input: P098Input): Promise<P098Output> {
  const N = input.costs.length;
  const M = input.costs[0].length;

  const master = new Model("LBBDMaster");
  const x = Array.from({ length: N }, (_, j) =>
    Array.from({ length: M }, (_, m) => master.binary(`x_${j}_${m}`))
  );

  let costObj = expr`0`;
  for (let j = 0; j < N; j++) {
    master.constraint(expr`sum(${x[j]}) == 1`, `assign_${j}`);
    for (let m = 0; m < M; m++) {
      costObj = costObj.add(x[j][m].mul(input.costs[j][m]));
    }
  }
  master.objective(minimize(costObj));

  let cutCounter = 0;
  const bendersRes = await master.solveBenders({
    maxIterations: 200,
    subproblem: async ({ getMasterValue }): Promise<BendersCut[] | null> => {
      const cuts: BendersCut[] = [];

      for (let m = 0; m < M; m++) {
        const assigned: number[] = [];
        for (let j = 0; j < N; j++) {
          if (getMasterValue(x[j][m]) > 0.5) assigned.push(j);
        }

        const check = await checkMachineSchedule(input, assigned);
        if (check.sat) continue;

        let minimal = [...assigned];
        if (minimal.length > 1) {
          for (const candidate of assigned) {
            const reduced = minimal.filter((j) => j !== candidate);
            if (reduced.length === 0) continue;
            const probe = await checkMachineSchedule(input, reduced);
            if (!probe.sat) {
              minimal = reduced;
            }
          }
        }

        const terms = minimal.map((j) => x[j][m]);
        cutCounter++;
        cuts.push({
          kind: "feasibility",
          name: `nogood_m${m}_${cutCounter}`,
          constraint: expr`sum(${terms}) <= ${minimal.length - 1}`,
        });
      }

      return cuts.length > 0 ? cuts : null;
    },
  });

  const assignments = Array(N).fill(0);
  const perMachine: number[][] = Array.from({ length: M }, () => []);
  let totalCost = 0;
  for (let j = 0; j < N; j++) {
    for (let m = 0; m < M; m++) {
      if ((bendersRes.values[x[j][m].name] ?? 0) > 0.5) {
        assignments[j] = m;
        perMachine[m].push(j);
        totalCost += input.costs[j][m];
        break;
      }
    }
  }

  const starts = Array(N).fill(0);
  for (let m = 0; m < M; m++) {
    const sched = await checkMachineSchedule(input, perMachine[m]);
    for (const [j, s] of sched.starts.entries()) {
      starts[j] = s;
    }
  }

  return { assignments, starts, totalCost };
}
