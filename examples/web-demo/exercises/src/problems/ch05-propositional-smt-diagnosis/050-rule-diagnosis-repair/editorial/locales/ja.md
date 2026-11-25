## アプローチ

3 段階の SMT パイプラインを Z3 で実行します。(1) `hardRules` と `softRules` 全体の整合性を `m.check({ solver: "z3" })` で判定し、`"Sat"` なら修復不要で返します。(2) `"Unsat"` なら `res.unsatCore` を起点に削除縮約で極小充足不能コア（MUS）を特定します。(3) ソフトルール緩和変数 `violated[k]` を導入して `optModel.solve({ solver: "z3" })` で最小コスト修復解を合成します。

## 数理モデル

$$
\begin{aligned}
\text{Stage 1:} \quad & \text{Check } \Bigl(\bigwedge_j H_j\Bigr) \land \Bigl(\bigwedge_k S_k\Bigr) \\
\text{Stage 2 (MUS):} \quad & C \subseteq H \cup S,\quad \text{Unsat}(C) \;\land\; \forall r \in C,\, \text{Sat}(C \setminus \{r\}) \\
\text{Stage 3 (Repair):} \quad & \min \sum_{k} w_k v_k \quad \text{s.t.} \quad H_j,\; S_k \lor (v_k = 1),\; S_k \implies (v_k = 0),\; v_k \in \{0, 1\}
\end{aligned}
$$

## ポイント

- **MUS と最小補正集合（MCS / MaxSAT 修復）の双対性**: 任意の極小充足不能コア（MUS）$C$ に対して、修復のために緩和されるソフトルール集合 $R$ は必ず $C \cap R \ne \emptyset$ を満たします（ヒット集合双対性）。そのため、複数の矛盾に共通するソフトルールを緩和すると総修復コストを抑えられます。
- **`check()` による診断と `solve()` による修復合成の連携**: 原因箇所の特定は `m.check({ solver: "z3" })`、全体最適の修復計算は `optModel.solve({ solver: "z3" })` に分担させる設計が自然です。
- 用語の確認: [ガイド・用語集 — 解の状態](?view=guide&lang=ja#solver-status) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

まず全ルールで `checkRulesSubset` を実行して整合性を確認します（Stage 1）。`"Unsat"` の場合は `initial.res.unsatCore` を起点に削除縮約で極小充足不能コア（MUS）を求め（Stage 2）、続けて各ソフトルールを `or` / `implies` と緩和変数 `violated[k]` で結んだ重み付き MaxSAT モデル `optModel` を Z3 で解きます（Stage 3）。

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
