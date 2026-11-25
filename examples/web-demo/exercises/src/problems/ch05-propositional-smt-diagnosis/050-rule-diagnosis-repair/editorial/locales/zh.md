## 解题思路

基于 Z3 构造三阶段诊断与修复流水线：(1) 先用 `m.check({ solver: "z3" })` 检验 `hardRules` 与 `softRules` 的联合一致性；(2) 若为 `"Unsat"`，则以 `res.unsatCore` 为起点执行删除收缩提取极小不可满足核心 (MUS)；(3) 再引入软规则松弛指示变量 `violated[k]`，通过 `optModel.solve({ solver: "z3" })` 求解总权重最小的修复方案。

## 数学模型

$$
\begin{aligned}
\text{Stage 1:} \quad & \text{Check } \Bigl(\bigwedge_j H_j\Bigr) \land \Bigl(\bigwedge_k S_k\Bigr) \\
\text{Stage 2 (MUS):} \quad & C \subseteq H \cup S,\quad \text{Unsat}(C) \;\land\; \forall r \in C,\, \text{Sat}(C \setminus \{r\}) \\
\text{Stage 3 (Repair):} \quad & \min \sum_{k} w_k v_k \quad \text{s.t.} \quad H_j,\; S_k \lor (v_k = 1),\; S_k \implies (v_k = 0),\; v_k \in \{0, 1\}
\end{aligned}
$$

## 核心要点

- **MUS 与修复集合的碰集对偶性**：任何一个有效修复集合 $R$ 都必须与每个极小冲突核 $C$ 至少交于一条软规则（$C \cap R \ne \emptyset$），因此同时覆盖多个冲突的共享软规则往往带来更低的总修复代价。
- **诊断 (`check()`) 与修复合成 (`solve()`) 的协同**：用 `m.check({ solver: "z3" })` 定位冲突根因，用 `optModel.solve({ solver: "z3" })` 统筹全局权衡并合成修复赋值。
- 概念参考：[指南与术语表 — 求解状态术语](?view=guide&lang=zh#solver-status) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

首先在全部规则上运行 `checkRulesSubset` 检查一致性（阶段 1）；若为 `"Unsat"`，则以 `initial.res.unsatCore` 为起点逐条删除收缩得到 `core`（阶段 2），再构建加权 MaxSAT 模型 `optModel`，用 `or`/`implies` 将每条软规则与 `violated[k]` 关联并由 Z3 最小化 `dot(weights, violated)`（阶段 3）。

**WaSHI (TypeScript)**

```ts
const initial = await checkRulesSubset(input, new Set(allIds));
if (initial.res.status === "Sat") {
  return { consistent: true, minimalCore: [], relaxedRules: [], repairCost: 0, repairedAssignment: initial.assignment };
}

// Stage 2: deletion-based MUS contraction starting from Z3's unsatCore
let core = Array.from(new Set(initial.res.unsatCore ?? allIds));
for (const ruleId of [...core]) {
  if (!core.includes(ruleId)) continue;
  const candidate = core.filter((id) => id !== ruleId);
  const sub = await checkRulesSubset(input, new Set(candidate));
  if (sub.res.status === "Unsat") {
    const subCore = sub.res.unsatCore;
    core = subCore?.length ? candidate.filter((id) => new Set(subCore).has(id)) : candidate;
  }
}

// Stage 3: Weighted MaxSAT repair via optModel.solve({ solver: "z3" })
const optModel = new Model("PolicyRepair");
const bools = optModel.bool(input.boolVars);
const ints: Record<string, Var> = {};
for (const spec of input.intVars) {
  ints[spec.name] = optModel.integer(spec.name, { lb: spec.lb, ub: spec.ub });
}
for (const h of input.hardRules) {
  optModel.constraint(compileSmt(h.expr, bools, ints), h.id);
}
const violated = optModel.binary(input.softRules.length, { prefix: "viol" });
const weights = input.softRules.map((s) => s.weight);
input.softRules.forEach((s, k) => {
  const cond = compileSmt(s.expr, bools, ints);
  optModel.constraint(or(cond, expr`${violated[k]} == 1`), `relax_${s.id}`);
  optModel.constraint(implies(cond, expr`${violated[k]} == 0`), `tight_${s.id}`);
});
if (violated.length > 0) {
  optModel.objective(minimize(dot(weights, violated)));
}
await optModel.solve({ solver: "z3" });
```
