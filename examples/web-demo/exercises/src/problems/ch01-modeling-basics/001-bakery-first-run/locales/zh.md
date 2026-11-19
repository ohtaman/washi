# #001. 面包房入门第一题

<!-- section:scenario -->
欢迎来到第 1 题！你可以任选 **WaSHI (TypeScript)** 或 **Python (highspy)** 运行求解器，熟悉浏览器内的自动判题反馈。

一家面包房在面粉和黄油库存上限内生产 **可颂** 和 **吐司**（产量均非负）。答题区中的初始代码几乎已经写好全部模型，唯独故意留下了一处错误：它把利润目标写成了最小化而不是最大化。

1. 先直接点击 **「运行并判题」**，观察 **SUBOPTIMAL** 提示（全部生产 0 个满足库存约束，因此可行但利润为 0）。
2. 将目标方向从最小化改为最大化，再次运行即可获得 **AC**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `flourCap` | `number` | 面粉库存上限 |
| `butterCap` | `number` | 黄油库存上限 |
| `croissantProfit` | `number` | 每个可颂的利润 |
| `loafProfit` | `number` | 每条吐司的利润 |
| `croissantFlour` | `number` | 每个可颂耗用的面粉 |
| `croissantButter` | `number` | 每个可颂耗用的黄油 |
| `loafFlour` | `number` | 每条吐司耗用的面粉 |
| `loafButter` | `number` | 每条吐司耗用的黄油 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `croissants` | `number` | 可颂产量 |
| `loaves` | `number` | 吐司产量 |
| `totalProfit` | `number` | 最大化后的总利润 |

<!-- section:example -->
**输入示例**

```json
{
  "flourCap": 120,
  "butterCap": 70,
  "croissantProfit": 40,
  "loafProfit": 70,
  "croissantFlour": 2,
  "croissantButter": 1,
  "loafFlour": 3,
  "loafButter": 2
}
```

**输出示例**

```json
{
  "croissants": 30,
  "loaves": 20,
  "totalProfit": 2600
}
```

制作 30 个可颂与 20 条吐司刚好用完 120 份面粉和 70 份黄油，达到最大总利润 **2,600**。

<!-- section:hint1 -->
在 WaSHI (TypeScript) 标签页中把 `m.objective(minimize(...))` 里的 `minimize` 改为 `maximize`（`import` 行已包含两者）；在 Python (`highspy`) 标签页中把 `h.minimize(...)` 改为 `h.maximize(...)`。

<!-- section:hint2 -->
注意 **SUBOPTIMAL（满足约束但非最优）** 与 **VIOLATION（违反约束）** 的区别：生产 `0` 个没有超库存，因此只是次优而非不可行。学会区分这两种反馈是优化调试的关键一步。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & p_c c + p_l \ell \\
\text{s.t.} \quad & f_c c + f_l \ell \le F_{\text{cap}} \\
& b_c c + b_l \ell \le B_{\text{cap}} \\
& c, \ell \ge 0
\end{aligned}
$$
