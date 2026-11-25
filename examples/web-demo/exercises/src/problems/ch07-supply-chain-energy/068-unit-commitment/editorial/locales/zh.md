## 解题思路

用 0-1 状态变量 $u_{g,t}$、开机变量 $v_{g,t}$ 与连续停机变量 $w_{g,t} \in [0, 1]$ 通过状态转移等式 $v_{g,t} - w_{g,t} = u_{g,t} - u_{g,t-1}$ 关联，利用紧致的 Rajan–Takriti 滑动窗口不等式刻画最小连续开机与停机时长，并配合状态相关的启停爬坡限制最小化总成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{g,t} \left( K_g v_{g,t} + c_g p_{g,t} \right) \\
\text{s.t.} \quad & \sum_{g} p_{g,t} = D_t && \forall t \\
& P^{\min}_g u_{g,t} \le p_{g,t} \le P^{\max}_g u_{g,t} && \forall g, t \\
& v_{g,t} - w_{g,t} = u_{g,t} - u_{g,t-1} && \forall g, t \;\; (u_{g,-1} = 0) \\
& \sum_{\tau=\max(0, t-U_g+1)}^{t} v_{g,\tau} \le u_{g,t}, \quad \sum_{\tau=\max(0, t-D^{\text{down}}_g+1)}^{t} w_{g,\tau} \le 1 - u_{g,t} && \forall g, t \\
& p_{g,t} - p_{g,t-1} \le R_g u_{g,t-1} + S_g (1 - u_{g,t-1}) && \forall g, t \ge 1 \\
& p_{g,t-1} - p_{g,t} \le R_g u_{g,t} + S_g (1 - u_{g,t}) && \forall g, t \ge 1
\end{aligned}
$$

其中 $S_g = \max(P^{\min}_g, R_g)$，$p_{g,0} \le S_g$，$u_{g,t}, v_{g,t} \in \{0, 1\}$，$w_{g,t} \in [0, 1]$，各参数分别对应 $D_t$（`demands[t]`）、$P^{\min}_g$（`pMin[g]`）、$P^{\max}_g$（`pMax[g]`）、$R_g$（`rampLimit[g]`）、$U_g$（`minUp[g]`）、$D^{\text{down}}_g$（`minDown[g]`）、$K_g$（`startupCosts[g]`）与 $c_g$（`fuelCosts[g]`）。

## 核心要点

- **刻画强松弛的启停窗口不等式**：将长度 $U_g$ 的窗口内开机次数和限制在 $u_{g,t}$ 以下，既保证开机后至少运行 $U_g$ 小时，又阻止同一周期内重复触发启动费；对称的停机约束同时自动杜绝 $v_{g,t}$ 与 $w_{g,t}$ 同时为正。
- **区分在线爬坡与启停跳变**：对于 $P^{\min}_g > R_g$ 的大型基荷机组，若直接限制 $|p_{g,t} - p_{g,t-1}| \le R_g$ 将无法开机；采用 $R_g u + S_g(1 - u)$ 既保护了运行期爬坡限制，又允许安全跨越最小稳燃门槛启停。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

为每台机组与每个时段构建状态转移等式，以及利用最近 `minUp[g]` 和 `minDown[g]` 切片之和的开机/停机窗口不等式。在 WaSHI 中使用 `slice` 和 `sum()` 对时间窗口求和，在 PuLP 中则用 `pulp.lpSum` 表达相同逻辑。

**WaSHI (TypeScript)**

```ts
const prevU = t === 0 ? 0 : u[g][t - 1];
m.constraint(expr`${v[g][t]} - ${w[g][t]} - ${u[g][t]} + ${prevU} == 0`);
const upStart = Math.max(0, t - input.minUp[g] + 1);
m.constraint(expr`${sum(v[g].slice(upStart, t + 1))} <= ${u[g][t]}`);
const downStart = Math.max(0, t - input.minDown[g] + 1);
m.constraint(expr`${sum(w[g].slice(downStart, t + 1))} + ${u[g][t]} <= 1`);
```

**PuLP (Python)**

```python
prev_u = 0 if t == 0 else u[g][t - 1]
prob += v[g][t] - w[g][t] == u[g][t] - prev_u
prob += pulp.lpSum(v[g][max(0, t - min_up[g] + 1) : t + 1]) <= u[g][t]
prob += pulp.lpSum(w[g][max(0, t - min_down[g] + 1) : t + 1]) <= 1 - u[g][t]
```
