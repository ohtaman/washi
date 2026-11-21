# #037. 2D Orthogonal Strip Packing

<!-- section:scenario -->
A sheet-metal cutting workshop must pack n axis-aligned rectangular items (without rotation) onto a fixed-width strip of width stripWidth and open height. Each item i has integer width widths[i] and height heights[i].

Choose non-negative integer bottom-left coordinates (x[i], y[i]) for every item so that all boxes fit within the horizontal strip [0, stripWidth] and no two boxes overlap in area, minimizing the total required strip height.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `stripWidth` | `number` | Fixed horizontal width of the packing strip |
| `widths` | `number[]` | Integer width of each rectangle (`<= stripWidth`) |
| `heights` | `number[]` | Integer height of each rectangle |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `x` | `number[]` | Bottom-left x-coordinate of each rectangle (`0 <= x[i] <= stripWidth - widths[i]`) |
| `y` | `number[]` | Bottom-left y-coordinate of each rectangle (`y[i] >= 0`) |
| `height` | `number` | Minimized strip height `max(y[i] + heights[i])` |

<!-- section:example -->
**Input**

```json
{
  "stripWidth": 6,
  "widths": [4, 2, 3],
  "heights": [3, 4, 2]
}
```

**Output**

```json
{
  "x": [2, 0, 3],
  "y": [2, 0, 0],
  "height": 5
}
```

Box 1 (`2×4`) sits at `(0, 0)` spanning `[0, 2) × [0, 4)`, Box 2 (`3×2`) sits at `(3, 0)` spanning `[3, 6) × [0, 2)`, and Box 0 (`4×3`) sits above Box 2 at `(2, 2)` spanning `[2, 6) × [2, 5)`, giving strip height **5**.

<!-- section:hint1 -->
Introduce two integer coordinate variables per rectangle: $x_i$ bounded by `[0, stripWidth - widths[i]]` and $y_i$ bounded by `[0, maxHeight - heights[i]]`. Every pair of distinct rectangles must be separated along at least one of the four orthogonal directions (left, right, below, or above).

<!-- section:hint2 -->
For each pair $i < j$, use `or(...)` over the four separation inequalities (`x[i] + widths[i] <= x[j]`, `x[j] + widths[j] <= x[i]`, `y[i] + heights[i] <= y[j]`, `y[j] + heights[j] <= y[i]`). Minimize `max(y.map((yi, i) => expr\`${yi} + ${input.heights[i]}\`))` using `solver: "pumpkin"`.
