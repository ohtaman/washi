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

- **为什么初始代码会返回 `VIOLATION`**：初始代码中缺少黄油库存约束，求解出的产量会超出黄油库存上限，因此判定为 `VIOLATION`。
- **LP（线性规划）**：所有变量均为连续型（`continuous`），且所有约束和目标函数均为一次线性式的模型称为 **LP**。
- 术语参考：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks)

## 核心代码片段

约束表达式可以通过模板字面量 `expr`（WaSHI）或 `prob += ...`（PuLP）直观地编写。传入第二个参数（例如 `"butter"`）为约束命名，有助于后续调试和核对模型。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${c} + 2 * ${l} <= ${input.butterCap}`, "butter");
```

**PuLP (Python)**

```python
prob += c + 2 * l <= butter_cap, "butter"
```
