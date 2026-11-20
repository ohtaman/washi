import { BoolExpr, BoolVar, Model, expr, minimize, not, or } from "@ohtaman/washi";

export type PolicyRule =
  | { id: string; type: "must_run"; line: number; weight?: number }
  | { id: string; type: "must_idle"; line: number; weight?: number }
  | { id: string; type: "min_active"; lines: number[]; weight?: number }
  | {
      id: string;
      type: "implies";
      ifLine: number;
      thenLine: number;
      thenActive: boolean;
      weight?: number;
    };

export interface P100Input {
  capacities: number[];
  fixedCosts: number[];
  prodCosts: number[];
  demand: number;
  baselineActive: number[];
  disruptionPenalty: number;
  hardRules: PolicyRule[];
  softRules: Array<PolicyRule & { weight: number }>;
}

export interface P100Output {
  droppedPolicies: string[];
  activeAssignments: number[];
  quantities: number[];
  totalCost: number;
}

function encodeRuleSmt(rule: PolicyRule, b: BoolVar[]): BoolExpr | BoolVar {
  switch (rule.type) {
    case "must_run":
      return b[rule.line];
    case "must_idle":
      return not(b[rule.line]);
    case "min_active":
      return rule.lines.length === 1 ? b[rule.lines[0]] : or(...rule.lines.map((l) => b[l]));
    case "implies":
      return b[rule.ifLine].implies(rule.thenActive ? b[rule.thenLine] : not(b[rule.thenLine]));
  }
}

async function checkPolicyWithZ3(
  input: P100Input,
  droppedSet: Set<string>
): Promise<{ sat: boolean; core: readonly string[] }> {
  const N = input.capacities.length;
  const smt = new Model("PolicyAuditZ3");
  const b = Array.from({ length: N }, (_, i) => smt.bool(`b_${i}`));
  const u = Array.from({ length: N }, (_, i) => smt.integer(`u_${i}`, { lb: 0, ub: 1 }));

  let capSum = expr`0`;
  for (let i = 0; i < N; i++) {
    smt.constraint(b[i].implies(u[i].eq(1)), `link_on_${i}`);
    smt.constraint(not(b[i]).implies(u[i].eq(0)), `link_off_${i}`);
    capSum = capSum.add(u[i].mul(input.capacities[i]));
  }
  smt.constraint(expr`${capSum} >= ${input.demand}`, "hard_capacity_cover");

  for (const rule of input.hardRules) {
    smt.constraint(encodeRuleSmt(rule, b), rule.id);
  }
  for (const rule of input.softRules) {
    if (!droppedSet.has(rule.id)) {
      smt.constraint(encodeRuleSmt(rule, b), rule.id);
    }
  }

  const res = await smt.check({ solver: "z3" });
  return {
    sat: res.status === "Sat",
    core: res.unsatCore ?? [],
  };
}

async function solveHittingSetMip(
  softRules: Array<PolicyRule & { weight: number }>,
  hittingSets: string[][]
): Promise<Set<string>> {
  const hs = new Model("IhsDropMip");
  const dropById = new Map(softRules.map((r) => [r.id, hs.binary(`drop_${r.id}`)]));
  let obj = expr`0`;
  for (const r of softRules) {
    obj = obj.add(dropById.get(r.id)!.mul(r.weight));
  }
  hs.objective(minimize(obj));

  hittingSets.forEach((coreIds, idx) => {
    const vars = coreIds.map((id) => dropById.get(id)!);
    hs.constraint(expr`sum(${vars}) >= 1`, `hit_${idx}`);
  });

  const status = await hs.solve();
  if (status !== "Optimal") {
    throw new Error("Policy hitting-set MIP is infeasible");
  }

  const dropped = new Set<string>();
  for (const r of softRules) {
    if ((dropById.get(r.id)!.value ?? 0) > 0.5) {
      dropped.add(r.id);
    }
  }
  return dropped;
}

export async function solve(input: P100Input): Promise<P100Output> {
  const softById = new Map(input.softRules.map((r) => [r.id, r]));
  const hittingSets: string[][] = [];
  let droppedSet = new Set<string>();

  for (let iter = 0; iter <= 1 << input.softRules.length; iter++) {
    const audit = await checkPolicyWithZ3(input, droppedSet);
    if (audit.sat) break;

    const coreSoft = audit.core.filter((id) => softById.has(id));
    if (coreSoft.length > 0) {
      hittingSets.push(coreSoft);
    } else {
      const activeSoft = input.softRules
        .map((r) => r.id)
        .filter((id) => !droppedSet.has(id));
      if (activeSoft.length === 0) {
        throw new Error("Hard rules and demand capacity are unsatisfiable");
      }
      hittingSets.push(activeSoft);
    }

    droppedSet = await solveHittingSetMip(input.softRules, hittingSets);
  }

  const N = input.capacities.length;
  const mip = new Model("RescheduleSopMip");
  const y = mip.binary(N, { prefix: "y" });
  const q = input.capacities.map((cap, i) => mip.continuous(`q_${i}`, { lb: 0, ub: cap }));
  const delta = mip.continuous(N, { prefix: "delta", lb: 0, ub: 1 });

  let obj = expr`0`;
  let totalSupply = expr`0`;
  for (let i = 0; i < N; i++) {
    obj = obj
      .add(y[i].mul(input.fixedCosts[i]))
      .add(q[i].mul(input.prodCosts[i]))
      .add(delta[i].mul(input.disruptionPenalty));
    totalSupply = totalSupply.add(q[i]);

    mip.constraint(expr`${q[i]} <= ${input.capacities[i]} * ${y[i]}`, `cap_${i}`);
    mip.constraint(expr`${delta[i]} - ${y[i]} >= ${-input.baselineActive[i]}`, `diff_pos_${i}`);
    mip.constraint(expr`${delta[i]} + ${y[i]} >= ${input.baselineActive[i]}`, `diff_neg_${i}`);
  }
  mip.constraint(expr`${totalSupply} >= ${input.demand}`, "demand");
  mip.objective(minimize(obj));

  const retained: PolicyRule[] = [
    ...input.hardRules,
    ...input.softRules.filter((r) => !droppedSet.has(r.id)),
  ];
  for (const rule of retained) {
    switch (rule.type) {
      case "must_run":
        mip.constraint(expr`${y[rule.line]} == 1`, `mip_${rule.id}`);
        break;
      case "must_idle":
        mip.constraint(expr`${y[rule.line]} == 0`, `mip_${rule.id}`);
        break;
      case "min_active":
        mip.constraint(expr`sum(${rule.lines.map((l) => y[l])}) >= 1`, `mip_${rule.id}`);
        break;
      case "implies":
        if (rule.thenActive) {
          mip.constraint(expr`${y[rule.ifLine]} - ${y[rule.thenLine]} <= 0`, `mip_${rule.id}`);
        } else {
          mip.constraint(expr`${y[rule.ifLine]} + ${y[rule.thenLine]} <= 1`, `mip_${rule.id}`);
        }
        break;
    }
  }

  const status = await mip.solve();
  if (status !== "Optimal" || mip.objectiveValue === null) {
    throw new Error(`Rescheduling MIP failed with status: ${status}`);
  }

  return {
    droppedPolicies: input.softRules.filter((r) => droppedSet.has(r.id)).map((r) => r.id),
    activeAssignments: y.map((v) => Math.round(v.value ?? 0) || 0),
    quantities: q.map((v) => Math.max(0, v.value ?? 0)),
    totalCost: mip.objectiveValue,
  };
}
