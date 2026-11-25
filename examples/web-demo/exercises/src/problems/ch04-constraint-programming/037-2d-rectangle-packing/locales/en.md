# #037. 2D Orthogonal Strip Packing

<!-- section:scenario -->
A sheet-metal processing plant designer is packing multiple rectangular parts (without rotation) tightly onto a steel strip of fixed horizontal width (all dimensions in mm). Each part has a given integer width and height.

Choose integer bottom-left coordinates for every rectangle so that all rectangles fit inside the strip width and no two overlap in area, minimizing the total required strip height (in mm).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `stripWidth` | `number` | Fixed horizontal width of the strip (integer, mm) |
| `widths` | `number[]` | Width of each rectangle (`<= stripWidth`, integer, mm) |
| `heights` | `number[]` | Height of each rectangle (integer, mm) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `x` | `number[]` | Bottom-left x-coordinate of each rectangle (`0 <= x[i] <= stripWidth - widths[i]`, mm) |
| `y` | `number[]` | Bottom-left y-coordinate of each rectangle (`y[i] >= 0`, mm) |
| `height` | `number` | Minimized strip height `max(y[i] + heights[i])` (mm) |

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

Placing Rectangle 1 (2×4) at (0, 0), Rectangle 2 (3×2) at (3, 0), and Rectangle 0 (4×3) in the upper-right space at (2, 2) avoids any overlap and achieves a total height of $\max(2 + 3, 0 + 4, 0 + 2) = \max(5, 4, 2) =$ **5** mm.

<!-- section:hint1 -->
Introduce two integer bottom-left coordinate variables per rectangle: a horizontal coordinate bounded between 0 and the remaining strip width, and a vertical coordinate bounded between 0 and a safe upper bound on strip height minus the rectangle's height. Every pair of distinct rectangles must be separated along at least one of the four orthogonal directions (left, right, below, or above).

<!-- section:hint2 -->
For each pair $i < j$, use `or(...)` over the four separation inequalities (`x[i] + widths[i] <= x[j]`, `x[j] + widths[j] <= x[i]`, `y[i] + heights[i] <= y[j]`, `y[j] + heights[j] <= y[i]`). Minimize the strip height via `minimize(max(...))` over each rectangle's top edge `y[i] + heights[i]` using `solver: "pumpkin"`.
