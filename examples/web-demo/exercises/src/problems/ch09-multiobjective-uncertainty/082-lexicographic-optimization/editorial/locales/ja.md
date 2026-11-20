## アプローチ

MIP を 2 回順次解きます。第 1 段階で人員枠のもとで未充足需要 `shortfall` の最小値 $Z_1^*$ を求め、第 2 段階で $\sum a_i x_i \ge D - (Z_1^* + \delta)$ という目標保持制約を追加したうえで運用コスト $\sum c_i x_i$ を最小化します。

## 数理モデル

$$
\begin{aligned}
\text{Stage 1:} \quad Z_1^* = \min_{x \in \{0,1\}^n,\, u \ge 0} \quad & u \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} r_i x_i \le R_{\max}, \quad \sum_{i=0}^{n-1} a_i x_i + u \ge D \\[6pt]
\text{Stage 2:} \quad \min_{x \in \{0,1\}^n} \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} r_i x_i \le R_{\max}, \quad \sum_{i=0}^{n-1} a_i x_i \ge D - (Z_1^* + \delta)
\end{aligned}
$$

## ポイント

- **重みづけ単一化より 2 段階求解が優れる理由**: $W \cdot Z_1 + Z_2$ のような巨大重み法はスケール依存の数値不安定を招くだけでなく、$\delta > 0$ の許容劣化（$Z_1 \le Z_1^* + \delta$）は $Z_1^*$ を先に求めないと制約として記述できません。
- **`obj1` は選択解 `x2` から再計算する**: 第 2 段階にペナルティなしの補助変数 `u` を残すと、実際のカバー量より大きく `u = Z_1^* + delta` に浮いてしまう恐れがあるため、直接下限制約を課して確定解から `obj1` を計算します。
- 用語の確認: [ガイド・用語集 — 問題の分類](?view=guide&lang=ja#paradigms) / [採点ステータス](?view=guide&lang=ja#verdicts)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m1.constraint(expr`dot(${input.coverage}, ${x1}) + ${shortfall1} >= ${input.targetDemand}`);
m1.objective(minimize(shortfall1));
await m1.solve();
const bestObj1 = m1.objectiveValue!;

const m2 = new Model("LexicographicStage2");
const x2 = m2.binary(n, { prefix: "x" });
m2.constraint(expr`dot(${input.crews}, ${x2}) <= ${input.maxCrews}`);
m2.constraint(expr`dot(${input.coverage}, ${x2}) >= ${input.targetDemand - (bestObj1 + input.slack) - 1e-6}`);
m2.objective(minimize(expr`dot(${input.opCosts}, ${x2})`));
```

**PuLP (Python)**

```python
prob1 += pulp.lpDot(coverage, x1) + shortfall1 >= target_demand
prob1 += shortfall1
prob1.solve(pulp.HiGHS(msg=False))
best_obj1 = float(pulp.value(prob1.objective))

prob2 = pulp.LpProblem("lex_stage2", pulp.LpMinimize)
x2 = [pulp.LpVariable(f"x2_{i}", cat=pulp.LpBinary) for i in range(n)]
prob2 += pulp.lpDot(crews, x2) <= max_crews
prob2 += pulp.lpDot(coverage, x2) >= target_demand - (best_obj1 + slack) - 1e-6
prob2 += pulp.lpDot(op_costs, x2)
```
