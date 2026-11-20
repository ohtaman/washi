## 解题思路

从可行的 `initialPlan` 出发，以步长 1 滑动长度为 `windowSize` 的重叠时间窗口。在每个子问题 `[start, start + windowSize)` 中，仅释放窗口内部的 0-1 启停变量 `y_t`，窗口外部的启停保持为当前最优值，而全部周期的连续产量 `p_t` 与库存 `inv_t` 均保持自由，从而在保证可行的同时实现跨窗口批量合并。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \big(K_t y_t + c_t p_t + h I_t\big) \\
\text{s.t.} \quad & I_{t-1} + p_t - I_t = d_t && \forall t \quad (I_{-1} = 0) \\
& 0 \le p_t \le C_t y_t, \quad I_t \ge 0 && \forall t \\
& y_t \in \{0, 1\} && \forall t \in [s, s + W) \\
& y_t = \bar{y}_t && \forall t \notin [s, s + W)
\end{aligned}
$$

## 核心要点

- **全局保持连续流量自由**：仅固定窗口外部的离散启停变量而保持全部连续产量与库存变量自由，可保证子问题始终可行并支持跨窗口整合生产批次。
- **步长为 1 的重叠滚动**：相邻窗口重叠 `windowSize - 1` 个周期，使前段释放出来的批量调整空间能逐期向后传递。
- **稳定固定变量边界**：在子模型中将窗口外启停声明为闭区间 `[v, v]` 的整数变量而非修改 `Binary` 上下界，可避免部分 LP/MIP 导出格式忽略二进制边界的问题。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
for (let pass = 0; pass < 10; pass++) {
  let improved = false;
  for (let start = 0; start <= T - win; start++) {
    const candidate = await solveWindow(input, best.setups, start, start + win);
    if (candidate && candidate.totalCost < best.totalCost - 1e-6) {
      best = candidate;
      improved = true;
    }
  }
  if (!improved) break;
}
```

**PuLP (Python)**

```python
for _ in range(10):
    improved = False
    for start in range(0, n_periods - win + 1):
        candidate = _solve_window(input_data, best["setups"], start, start + win)
        if candidate is not None and candidate["totalCost"] < best["totalCost"] - 1e-6:
            best = candidate
            improved = True
    if not improved:
        break
```
