## 解题思路

通过连接约束把整数宿主机分配 `hosts[i]` 与 0-1 矩阵 `assign[i][k]` 关联，计算宿主机负载 `load[k]`、施加上限和反亲和冲突 `hosts[u] != hosts[v]`，并添加对称性破除不等式 `used[k] >= used[k + 1]` 与 `load[k] >= load[k + 1]`，从而合并同构宿主机置换后最小化 `sum(used)`。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{K-1} u_k \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} b_{i,k} = 1, \quad h_i = \sum_{k=0}^{K-1} k \, b_{i,k} && \forall i \\
& L_k = \sum_{i=0}^{n-1} s_i b_{i,k}, \quad u_k \le L_k \le C \, u_k && \forall k \\
& h_u \ne h_v && \forall (u, v) \in E_{\text{conf}} \\
& u_k \ge u_{k+1}, \quad L_k \ge L_{k+1} && \forall k \in \{0, \dots, K-2\}
\end{aligned}
$$

## 核心要点

- **消去 $K!$ 棵对称搜索子树**：由于所有宿主机完全同构，任意交换宿主机编号均对应等价解。若不破除对称性，求解器在证明更少机器不可行时将重复搜索大量置换。施加 `used[k] >= used[k + 1]` 与 `load[k] >= load[k + 1]` 可将等价解唯一归约到非递增负载序列。
- **切勿混用互不兼容的对称破除规则**：“按负载降序（`load[k] >= load[k + 1]`）”与“首次出现规范编号（`hosts[0] == 0` 且 `hosts[i] <= max(hosts[0..i-1]) + 1`）”各自都是有效破除，但两者不能同时叠加——否则当 0 号虚拟机不在最高负载机器上时会错误剪掉最优解。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(input.conflicts.map(([u, v]) => expr`${hosts[u]} != ${hosts[v]}`));

// Break identical-host permutation symmetry (prefix active + non-increasing load)
m.constraint(used.slice(0, -1).map((u, k) => expr`${u} >= ${used[k + 1]}`));
m.constraint(load.slice(0, -1).map((ld, k) => expr`${ld} >= ${load[k + 1]}`));

m.objective(minimize(sum(used)));
```
