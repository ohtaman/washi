## 解题思路

将牛角包产量 `c` 和吐司产量 `l` 设为非负 **连续决策变量**，在面粉和黄油两条 `<=` 资源上限约束下最大化总利润。

## 数学模型

$$
\begin{aligned}
\max \quad & 40c + 70\ell \\
\text{s.t.} \quad & 2c + 3\ell \le \text{flourCap} \\
& c + 2\ell \le \text{butterCap} \\
& c, \ell \ge 0
\end{aligned}
$$

## 要点总结

- **为什么初始代码会返回 `VIOLATION`**：缺少黄油约束时，求解器会把全部面粉用于吐司（$c=0, \ell=40$），导致黄油用量达到 `80 > 70`。
- **LP 的几何直观**：由于所有变量均为连续型、约束与目标均为线性，这是一个标准的 **LP（线性规划）**，最优解一定会落在可行域多边形的某个顶点上。
- 术语参考：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks)

## 核心代码片段

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${c} + 2 * ${l} <= ${input.butterCap}`, "butter");
```

**Python (highspy)**

```python
h.addConstr(c + 2 * l <= input_data["butterCap"])
```
