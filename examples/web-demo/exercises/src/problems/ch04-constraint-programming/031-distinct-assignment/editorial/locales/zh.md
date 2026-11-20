## 解题思路

用有限域整数变量 `channels[i]`（范围 `0 .. numChannels - 1`）直接表示各发射台的信道选择，通过全局约束 `distinct(channels)` 消除冲突复用，用 `abs(channels[u] - channels[v]) >= 2` 强制邻道间隔，并在 Pumpkin 中最小化 `dot(weights, channels)`。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} w_i \, c_i \\
\text{s.t.} \quad & \text{AllDifferent}(c_0, \dots, c_{n-1}) \\
& |c_u - c_v| \ge 2 && \forall (u, v) \in E_{\text{adj}} \\
& c_i \in \{0, \dots, M - 1\} \cap \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **直接整数域建模**：无需像 MIP 那样展开 $n \times M$ 个 0-1 变量，只需为每个发射台声明带有限整数边界 `{ lb: 0, ub: numChannels - 1 }` 的整数变量（Pumpkin 要求所有整数变量均须有限有界）。
- **原生全局传播器 `distinct()` 与 `abs()`**：`distinct(channels)` 直接触发全异传播，`expr\`abs(\${channels[u]} - \${channels[v]}) >= 2\`` 则直接下沉为绝对值传播器，无需手动构造 Big-M 析取约束。
- 参考资料：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
const channels = m.integer(n, { lb: 0, ub: input.numChannels - 1, prefix: "ch" });

m.constraint(distinct(channels), "distinct_channels");
m.constraint(
  input.adjacentConflicts.map(
    ([u, v]) => expr`abs(${channels[u]} - ${channels[v]}) >= 2`
  )
);

m.objective(minimize(expr`dot(${input.weights}, ${channels})`));
await m.solve({ solver: "pumpkin" });
```
