## 思路

用二元变量 $x_{ij}$（$i \ne j$）表示小组转移边，用连续变量 $t_i \in [e_i, l_i]$ 表示各游乐项目的开始时间（其中 $e_i = \text{earliest}[i]$，$l_i = \text{latest}[i]$，$s_i = \text{visitDurations}[i]$，$d_{ij} = \text{travelTimes}[i][j]$，$K = \text{maxGroups}$）。沿激活转移 $(i, j)$ 通过紧凑 Big-M 不等式 $t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij})$ 衔接时间，并在 $x_{i0} = 1$ 时强制满足闭园返回期限 $t_i + s_i + d_{i0} \le l_0$。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n} \sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{1, \dots, n\}, \qquad \sum_{j=1}^n x_{0j} = \sum_{i=1}^n x_{i0} \le K \\
& t_0 = e_0, \quad e_i \le t_i \le l_i, \quad 1 \le u_i \le n && \forall i \in \{1, \dots, n\} \\
& t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij}) && \forall i \in \{0, \dots, n\}, j \in \{1, \dots, n\}, i \ne j \\
& u_i + 1 - u_j \le n(1 - x_{ij}) && \forall i, j \in \{1, \dots, n\}, i \ne j \\
& t_i + s_i + d_{i0} \le l_0 + M_{i0}(1 - x_{i0}) && \forall i \in \{1, \dots, n\} \\
& x_{ij} \in \{0, 1\} && \forall i \ne j
\end{aligned}
$$

其中 $M_{ij} = \max(0, l_i + s_i + d_{ij} - e_j)$，$M_{i0} = \max(0, l_i + s_i + d_{i0} - l_0)$。

## 关键要点

- **用 `<=` 衔接自动允许等待**：使用不等式 $t_j \ge t_i + s_i + d_{ij}$ 而非等式，再结合下界 $t_j \ge e_j$，即可让早到的小组自然等待至项目开放时间 $e_j$。
- **MTZ 顺位势能消除零耗时子环**：若同址项目的游玩与步行总耗时为 $s_i + d_{ij} = 0$，仅靠时间单调性无法阻止脱离入口的零耗时子环（如 `1 -> 2 -> 1`）。引入游览顺位势能 $u_i \in [1, n]$ 与约束 $u_i + 1 - u_j \le n(1 - x_{ij})$ 后，即使时间为零也能彻底消除项目子环。
- **紧凑 Big-M 取值**：利用 $t_i \le l_i$ 与 $t_j \ge e_j$ 计算最小有效 Big-M，可以显著收紧 LP 松弛。
- 相关概念：[指南与术语表 — 核心建模模块](?view=guide&lang=zh#building-blocks) 与 [问题族](?view=guide&lang=zh#paradigms)。

## 核心实现

在下方实现中，`n = travelTimes.length` 包含入口，因此游乐项目索引为 `1 .. n - 1`，MTZ 系数为 `n - 1`。遍历 `attractions`，统一注册返回入口时的闭园时间约束，以及项目之间转移的紧凑 Big-M 时间衔接与 MTZ 顺位约束。

**WaSHI (TypeScript)**

```ts
const attractions = Array.from({ length: n - 1 }, (_, k) => k + 1);
attractions.forEach((i) => {
  const bigMi0 = Math.max(0, latest[i] + visitDurations[i] + travelTimes[i][0] - latest[0]);
  m.constraint(
    expr`${t[i]} + ${visitDurations[i] + travelTimes[i][0]} <= ${latest[0]} + ${bigMi0} * (1 - ${x[i][0]!})`
  );
  m.constraint(
    attractions
      .filter((j) => i !== j)
      .flatMap((j) => {
        const bigMij = Math.max(
          0,
          latest[i] + visitDurations[i] + travelTimes[i][j] - earliest[j]
        );
        return [
          expr`${t[i]} + ${visitDurations[i] + travelTimes[i][j]} - ${t[j]} <= ${bigMij} * (1 - ${x[i][j]!})`,
          expr`${u[i]!} + 1 - ${u[j]!} <= ${n - 1} * (1 - ${x[i][j]!})`,
        ];
      })
  );
});
```

**PuLP (Python)**

```python
for i in range(1, n):
    mi0 = max(0, latest[i] + visit_durations[i] + travel_times[i][0] - latest[0])
    prob += t[i] + visit_durations[i] + travel_times[i][0] <= latest[0] + mi0 * (1 - x[i][0])
    for j in range(1, n):
        if i != j:
            mij = max(0, latest[i] + visit_durations[i] + travel_times[i][j] - earliest[j])
            prob += t[i] + visit_durations[i] + travel_times[i][j] - t[j] <= mij * (1 - x[i][j])
            prob += u[i] + 1 - u[j] <= (n - 1) * (1 - x[i][j])
```
