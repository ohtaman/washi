## 求解思路

通过两个顺序模型求解：第一阶段用二元指派 MIP 找到最大化总估值 $\sum_i v_{i,\sigma(i)}$ 的分房方案 $\sigma$；第二阶段固定该分房方案，求解关于非负连续租金 $p_r \ge 0$（总和等于 $R_{\text{total}}$）的 LP，在满足无嫉妒约束的同时最大化最小住户剩余 $z$。

## 数学模型

$$
\begin{aligned}
\text{Stage 1:} \quad \max_{x \in \{0,1\}^{n \times n}} \quad & \sum_{i=0}^{n-1} \sum_{r=0}^{n-1} v_{i,r} x_{i,r} \\
\text{s.t.} \quad & \sum_{r=0}^{n-1} x_{i,r} = 1 \quad \forall i, \qquad \sum_{i=0}^{n-1} x_{i,r} = 1 \quad \forall r \\[6pt]
\text{Stage 2:} \quad \max_{p \in \mathbb{R}_{\ge 0}^n,\, z \in \mathbb{R}} \quad & z \\
\text{s.t.} \quad & \sum_{r=0}^{n-1} p_r = R_{\text{total}}, \\
& v_{i,\sigma(i)} - p_{\sigma(i)} \ge z \quad \forall i, \\
& v_{i,\sigma(i)} - p_{\sigma(i)} \ge v_{i,r} - p_r \quad \forall i, r
\end{aligned}
$$

## 关键要点

- **为什么必须先求解第一阶段**：由线性规划对偶理论（循环单调性），在不限符号的实数租金下，分房方案 $\sigma$ 存在无嫉妒租金向量的充要条件是 $\sigma$ 最大化总估值 $\sum_i v_{i,\sigma(i)}$（次优分房必定使第二阶段无解）。在额外加上非负租金 $p_r \ge 0$ 与固定总租金 $\sum_r p_r = R_{\text{total}}$ 的约束下，最大化总估值依然是必要条件（尽管在某房间估值优势超过总租金的极端情形下未必充分）；本题所有算例均满足非负无嫉妒租金的可行性。
- **无嫉妒约束可能限制等剩余分配**：虽然平均剩余 $(V^* - R_{\text{total}}) / n$ 是固定的，但为了消除对热门房间的嫉妒，必须提高该房间租金，从而使最大最小剩余 $z^*$ 严格低于平均剩余。
- **无界最小剩余变量**：将 `minSurplus` 设为无界连续变量（WaSHI 中 `lb: -Infinity`，PuLP 中 `lowBound=None`），即使总租金高于总估值导致剩余为负时模型依然有效。
- 相关概念：[指南与术语表 — 问题族](?view=guide&lang=zh#paradigms) 与 [判定状态](?view=guide&lang=zh#verdicts)。

## 核心实现

求解第一阶段指派模型 `m1` 以确定分房方案 $\sigma$ 后，新建第二阶段模型 `m2`，将 `rents` 的下界设为 0，并将 `minSurplus` 声明为无符号限制的自由变量。

**WaSHI (TypeScript)**

```ts
// 第一阶段：分房指派 MIP
m1.constraint(x.map((row) => expr`${sum(row)} == 1`));
m1.constraint(Array.from({ length: n }, (_, r) => expr`${sum(x.map((row) => row[r]))} == 1`));
m1.objective(maximize(sum(x.flatMap((row, i) => row.map((v, r) => expr`${input.valuations[i][r]} * ${v}`)))));
await m1.solve();

// 第二阶段：无嫉妒最大最小剩余 LP
const rents = m2.continuous(n, { lb: 0, prefix: "rent" });
const minSurplus = m2.continuous("minSurplus", { lb: -Infinity, ub: Infinity });
m2.constraint(expr`${sum(rents)} == ${input.totalRent}`, "total_rent");
```

**PuLP (Python)**

```python
# 第一阶段：分房指派 MIP
for i in range(n):
    prob1 += pulp.lpSum(x[i]) == 1
for r in range(n):
    prob1 += pulp.lpSum(x[i][r] for i in range(n)) == 1
prob1 += pulp.lpSum(valuations[i][r] * x[i][r] for i in range(n) for r in range(n))
prob1.solve(pulp.HiGHS(msg=False))

# 第二阶段：无嫉妒最大最小剩余 LP
rents = [pulp.LpVariable(f"rent_{r}", lowBound=0) for r in range(n)]
min_surplus = pulp.LpVariable("min_surplus", lowBound=None)
prob2 += pulp.lpSum(rents) == total_rent
```
