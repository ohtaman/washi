## 解题思路

按顺序求解两个 MIP：第一阶段在班组预算内最小化未满足需求 `shortfall` 得到最优主目标 $Z_1^*$；第二阶段添加主目标锁定约束 $\sum a_i x_i \ge D - (Z_1^* + \delta)$，再最小化次级运营总成本 $\sum c_i x_i$。

## 数学模型

$$
\begin{aligned}
\text{Stage 1:} \quad Z_1^* = \min_{x \in \{0,1\}^n,\, u \ge 0} \quad & u \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} r_i x_i \le R_{\max}, \quad \sum_{i=0}^{n-1} a_i x_i + u \ge D \\[6pt]
\text{Stage 2:} \quad \min_{x \in \{0,1\}^n} \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} r_i x_i \le R_{\max}, \quad \sum_{i=0}^{n-1} a_i x_i \ge D - (Z_1^* + \delta)
\end{aligned}
$$

## 核心要点

- **为何两阶段求解优于大权重加权和**：把目标拼成 $W \cdot Z_1 + Z_2$ 不仅容易因尺度差异出现数值病态，而且当存在允许退让容差 $\delta > 0$（即 $Z_1 \le Z_1^* + \delta$）时，必须先求得 $Z_1^*$ 才能构造第二阶段约束。
- **从最终解 `x2` 独立回算 `obj1`**：在第二阶段直接把覆盖量下限写入约束，并根据选定解 `x2` 计算 `max(0, targetDemand - covered)`，可避免无惩罚的松弛变量随意取上界。
- 概念参考：[指南与术语表 — 常见模型分类](?view=guide&lang=zh#paradigms) / [判题结果含义](?view=guide&lang=zh#verdicts)

## 实现要点

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
