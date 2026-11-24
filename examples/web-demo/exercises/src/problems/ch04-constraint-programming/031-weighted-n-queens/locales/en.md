# #031. Weighted N-Queens

<!-- section:scenario -->
A puzzle designer is placing $N$ queens on an $N \times N$ chessboard, with one queen in each row. Each queen's column index is an integer from 0 to $N - 1$, and no two queens may share the same column or lie on the same diagonal.

Each cell has its own integer placement cost. Among all mutually non-attacking placements, minimize the total cost of the selected cells.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costMatrix` | `number[][]` | `N x N` matrix where `costMatrix[r][c]` is the cost of placing row `r`'s queen in column `c` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `cols` | `number[]` | Assigned column index in `[0, N - 1]` for each row `r` |
| `totalCost` | `number` | Minimized sum of selected cell weights |

<!-- section:example -->
**Input**

```json
{
  "costMatrix": [
    [7, 2, 5, 9],
    [9, 4, 8, 1],
    [3, 7, 4, 6],
    [5, 8, 2, 7]
  ]
}
```

**Output**

```json
{
  "cols": [1, 3, 0, 2],
  "totalCost": 8
}
```

Queens at (0, 1), (1, 3), (2, 0), and (3, 2) share no columns or diagonals and incur total cost $2 + 1 + 3 + 2 =$ **8**.

<!-- section:hint1 -->
Introduce one integer decision variable per row representing the column index of that row's queen. Enforce uniqueness across columns as well as uniqueness across both sets of diagonals, and sum the selected cell weights across all rows.

<!-- section:hint2 -->
Enforce `distinct(cols)` for columns, plus `distinct` over the shifted expressions `cols[r] + r` and `cols[r] - r` for the two diagonal directions. Look up each row's cost with `at(costMatrix[r], cols[r])`, minimize their `sum(...)`, and solve using `solver: "pumpkin"`.
