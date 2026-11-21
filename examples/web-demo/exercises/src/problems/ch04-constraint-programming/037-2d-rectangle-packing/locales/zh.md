# #037. 二维正交矩形条带装箱

<!-- section:scenario -->
某金属板材切割车间需要将 n 个轴对齐矩形零件（不可旋转）装入一条固定宽度为 stripWidth、高度不限的条带区域。第 i 个矩形的整数宽和高分别为 widths[i] 与 heights[i]。

请为每个矩形确定非负整数左下角坐标 (x[i], y[i])，确保全部矩形位于 [0, stripWidth] 宽度内且任意两个矩形不重叠，使所需条带总高度最小化。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `stripWidth` | `number` | 固定条带横向宽度 |
| `widths` | `number[]` | 每个矩形的整数宽度（`<= stripWidth`） |
| `heights` | `number[]` | 每个矩形的整数高度 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `x` | `number[]` | 每个矩形左下角横坐标（`0 <= x[i] <= stripWidth - widths[i]`） |
| `y` | `number[]` | 每个矩形左下角纵坐标（`y[i] >= 0`） |
| `height` | `number` | 最小化后的条带高度 `max(y[i] + heights[i])` |

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

矩形 1（`2×4`）置于 `(0, 0)` 占据 `[0, 2) × [0, 4)`，矩形 2（`3×2`）置于 `(3, 0)` 占据 `[3, 6) × [0, 2)`，矩形 0（`4×3`）置于 `(2, 2)` 占据 `[2, 6) × [2, 5)`，互不重叠且总高度为 **5**。

<!-- section:hint1 -->
为每个矩形定义两个整数坐标变量：$x_i \in [0, \text{stripWidth} - \text{widths}[i]]$ 和 $y_i \in [0, \text{maxHeight} - \text{heights}[i]]$。任意两个不同的矩形必须在左、右、下、上四个正交方向中至少满足一个分离关系。

<!-- section:hint2 -->
对每对矩形 $i < j$，使用 `or(...)` 组合四个方向的分离不等式（`x[i] + widths[i] <= x[j]`、`x[j] + widths[j] <= x[i]`、`y[i] + heights[i] <= y[j]`、`y[j] + heights[j] <= y[i]`）。以 `minimize(max(y.map((yi, i) => expr\`${yi} + ${input.heights[i]}\`)))` 为目标，并通过 `solver: "pumpkin"` 求解。
