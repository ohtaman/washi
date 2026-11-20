## アプローチ

配列 `epsilons` の各しきい値 $\varepsilon_k$ に対して、予算制約に加えて第 2 指標の制約 $\sum e_j x_j \le \varepsilon_k$ を課した MIP を構築・求解し、それぞれの最適選択ベクトルと利益を記録してパレート曲線を求めます。

## 数理モデル

$$
\begin{aligned}
\forall k \in \{0, \dots, K-1\}: \quad z(\varepsilon_k) = \max_{x \in \{0,1\}^n} \quad & \sum_{j=0}^{n-1} p_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} b_j x_j \le B_{\text{cap}} \\
& \sum_{j=0}^{n-1} e_j x_j \le \varepsilon_k
\end{aligned}
$$

## ポイント

- **重みづけ和法では拾えない非凸フロンティア点の発見**: 0-1 変数を伴う MIP のパレートフロンティアは非凸になるため、$\max p^\top x - w\, e^\top x$ のような線形重みづけ和法では凸包の頂点しか得られず、内側に凹んだパレート解（Case 2 の `(e=7, p=54)` など）を見落とします。ε-制約法なら非凸点も漏れなく厳密に取得できます。
- **単位系に依存しない直観的パラメータ化**: 重みのチューニングなしで「排出量 $\varepsilon_k$ 以下という物理上限の下での最大利益」を直接制御できます。
- 用語の確認: [ガイド・用語集 — 問題の分類](?view=guide&lang=ja#paradigms) / [基本要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (let k = 0; k < input.epsilons.length; k++) {
  const m = new Model(`EpsilonPareto_${k}`);
  const x = m.binary(n, { prefix: "x" });
  m.constraint(expr`dot(${input.budgets}, ${x}) <= ${input.budgetCap}`);
  m.constraint(expr`dot(${input.emissions}, ${x}) <= ${input.epsilons[k]}`);
  m.objective(maximize(expr`dot(${input.profits}, ${x})`));
  await m.solve();
  selections.push(x.map((v) => Math.round(v.value!) || 0));
  frontierProfits.push(m.objectiveValue!);
}
```

**PuLP (Python)**

```python
for k, eps in enumerate(epsilons):
    prob = pulp.LpProblem(f"epsilon_pareto_{k}", pulp.LpMaximize)
    x = [pulp.LpVariable(f"x_{j}", cat=pulp.LpBinary) for j in range(n)]
    prob += pulp.lpDot(budgets, x) <= budget_cap
    prob += pulp.lpDot(emissions, x) <= eps
    prob += pulp.lpDot(profits, x)
    prob.solve(pulp.HiGHS(msg=False))
```
