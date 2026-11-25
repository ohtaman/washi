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

- **重みづけ和法では拾えない非支持パレート点の取得**: 0-1 変数を伴う離散 MIP のパレートフロンティアは非凸になり得るため、$\max p^\top x - w\, e^\top x$ のような線形重みづけ和法では上側凸包の頂点しか得られず、内側に凹んだ非支持パレート解（たとえば入力例の $(e=6, p=45)$ は $(0, 0)$ と $(11, 85)$ を結ぶ線分より下にあります）を見落とします。$\varepsilon$-制約法で各 $\varepsilon_k$ をスイープすれば凸性に関わらず各しきい値の厳密な最大利益 $z(\varepsilon_k)$ を取得できます（なお、同一利益のタイがある場合に厳密な非支配解を選ぶには、微小な排出量ペナルティを加える拡張 $\varepsilon$-制約法を用います）。
- **単位系に依存しない直観的パラメータ化**: 重みのチューニングなしで「排出量 $\varepsilon_k$ 以下という物理上限の下での最大利益」を直接制御できます。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [モデルの基本構成要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

排出枠 `input.epsilons` の各しきい値ごとに独立した `Model` を生成し、`dot(...)` で予算制約・排出制約・利益最大化を記述して順次 `await m.solve()` を呼び出します。

**WaSHI (TypeScript)**

```ts
for (const [k, eps] of input.epsilons.entries()) {
  const m = new Model(`EpsilonPareto_${k}`);
  const x = m.binary(n, { prefix: "x" });
  m.constraint(expr`dot(${input.budgets}, ${x}) <= ${input.budgetCap}`);
  m.constraint(expr`dot(${input.emissions}, ${x}) <= ${eps}`);
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
    selections.append([round(pulp.value(v)) for v in x])
    frontier_profits.append(float(pulp.value(prob.objective)))
```
