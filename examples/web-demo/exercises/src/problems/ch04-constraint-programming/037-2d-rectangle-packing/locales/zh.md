# #037. 二维正交矩形条带装箱

<!-- section:scenario -->
钣金加工厂的设计负责人正在将多个矩形零件（不可旋转）紧凑地排布到固定横宽的带状钢板（宽 mm、高 mm）上。每个零件都规定了整数的横宽与高度。

请确定每个矩形的左下角整数坐标，使所有矩形均位于条带宽度内且面积互不重叠，并最小化所需的总高度（mm）。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `stripWidth` | `number` | 条带区域的固定横宽（mm） |
| `widths` | `number[]` | 各矩形的横宽（`<= stripWidth`，mm） |
| `heights` | `number[]` | 各矩形的高度（整数，mm） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `x` | `number[]` | 各矩形左下角 x 坐标（`0 <= x[i] <= stripWidth - widths[i]`，mm） |
| `y` | `number[]` | 各矩形左下角 y 坐标（`y[i] >= 0`，mm） |
| `height` | `number` | 最小化后的条带高度 `max(y[i] + heights[i])`（mm） |

<!-- section:example -->
**输入示例**

```json
{
  "stripWidth": 6,
  "widths": [4, 2, 3],
  "heights": [3, 4, 2]
}
```

**输出示例**

```json
{
  "x": [2, 0, 3],
  "y": [2, 0, 0],
  "height": 5
}
```

将矩形 1（2×4）放在 (0, 0)、矩形 2（3×2）放在 (3, 0)，并在其右上角空间 (2, 2) 放置矩形 0（4×3），即可无重叠地将总高度控制在 $\max(2 + 3, 0 + 4, 0 + 2) = \max(5, 4, 2) =$ **5** mm。

<!-- section:hint1 -->
为每个矩形定义两个整数坐标变量：$x_i \in [0, \text{stripWidth} - \text{widths}[i]]$ 和 $y_i \in [0, \text{maxHeight} - \text{heights}[i]]$。任意两个不同的矩形必须在左、右、下、上四个正交方向中至少满足一个分离关系。

<!-- section:hint2 -->
对每对矩形 $i < j$，使用 `or(...)` 组合四个方向的分离不等式（`x[i] + widths[i] <= x[j]`、`x[j] + widths[j] <= x[i]`、`y[i] + heights[i] <= y[j]`、`y[j] + heights[j] <= y[i]`）。以 `minimize(max(y.map((yi, i) => expr\`${yi} + ${input.heights[i]}\`)))` 为目标，并通过 `solver: "pumpkin"` 求解。
