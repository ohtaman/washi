## Approach

Formulate Logic-Based Benders Decomposition (LBBD) via `master.solveBenders`: the HiGHS binary master selects one machine `m` per job minimizing total assignment cost, while the subproblem checks each machine independently using Pumpkin CP (`disjoint` + integer time-window bounds). Whenever a machine assignment $S_m$ is `Unsat`, greedy deletion narrows it to a minimal infeasible subset $K_m \subseteq S_m$ and returns a combinatorial no-good cut blocking $K_m$ on machine $m$.

## Mathematical Model

$$
\begin{aligned}
\text{(Master)} \quad \min \quad & \sum_{j=0}^{N-1} \sum_{m=0}^{M-1} c_{jm} x_{jm} \\
\text{s.t.} \quad & \sum_{m=0}^{M-1} x_{jm} = 1 && \forall j \\
& \sum_{j \in K} x_{jm} \le |K| - 1 && \forall (K, m) \in \mathcal{N}_{\text{no-good}}, \quad x_{jm} \in \{0, 1\}
\end{aligned}
$$

$$
\begin{aligned}
\text{(CP Sub}_m(S_m)\text{)} \quad \text{find } & s_j \in [\text{rel}_j,\ \min(\text{dl}_j, H) - p_j] \cap \mathbb{Z} && \forall j \in S_m \\
\text{s.t.} \quad & \text{disjoint}\big(\{(s_j, p_j) : j \in S_m\}\big)
\end{aligned}
$$

## Key Points

- **Separation without `theta`**: Because every objective term $c_{jm} x_{jm}$ lives inside the master problem, subproblems only verify combinatorial feasibility; omitting `theta` and returning `null` once every machine CP model returns `"Sat"` certifies global optimality immediately.
- **Minimal conflict tightening**: Strengthening a full assignment $S_m$ down to a minimal infeasible subset $K_m$ (via greedy deletion calls to `check({ solver: "pumpkin" })`) removes entire families of redundant infeasible schedules in one cut instead of banning one full solution at a time.
- **Boundary safety for zero or one job**: Before calling `sub.integer`, verify $\text{ub} \ge \text{lb}$ (since single-job time-window violations have $K_m = \{j\}$), and invoke `disjoint` whenever $|S_m| \ge 2$.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

Inside the `subproblem` callback of `master.solveBenders`, verify each machine `m`'s assigned jobs with `checkMachineSchedule` (Pumpkin CP's `disjoint` constraint), and for any machine returning `Unsat`, extract a minimal conflict set and emit a no-good cut.

**WaSHI (TypeScript)**

```ts
const bendersRes = await master.solveBenders({
  maxIterations: 200,
  subproblem: async ({ getMasterValue }) => {
    const cuts: BendersCut[] = [];
    for (const m of Array.from({ length: M }, (_, idx) => idx)) {
      const assigned = jobs.filter((j) => getMasterValue(x[j][m]) > 0.5);
      const check = await checkMachineSchedule(input, assigned);
      if (check.sat) continue;
      let minimal = [...assigned];
      for (const j of assigned) {
        const reduced = minimal.filter((k) => k !== j);
        if (reduced.length > 0 && !(await checkMachineSchedule(input, reduced)).sat) minimal = reduced;
      }
      cuts.push({
        kind: "feasibility",
        constraint: expr`sum(${minimal.map((j) => x[j][m])}) <= ${minimal.length - 1}`,
      });
    }
    return cuts.length > 0 ? cuts : null;
  },
});
```
