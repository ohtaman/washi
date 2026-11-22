# #003. 硬币找零谜题

<!-- section:scenario -->
你需要使用有限数量的硬币凑出精确的目标金额。对于每种硬币，已知其面额和可用的最大枚数，你必须为每种硬币选择（从零到其可用上限之间的）**整数**枚数，使总金额恰好等于目标金额，同时**最小化硬币总枚数**。

初始代码中有两处刻意留下的空缺：使用了不带上限的连续变量，并且缺少精确等于目标金额的约束。

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `denominations` | `number[]` | 每种硬币的面额 |
| `maxCounts` | `number[]` | 每种硬币可用的最大枚数 |
| `targetAmount` | `number` | 需要凑出的精确目标金额 |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `counts` | `number[]` | 每种硬币使用的整数枚数 |
| `totalCoins` | `number` | 最小化后的硬币总枚数 |

<!-- section:example -->
**Input**

```json
{
  "denominations": [1, 3, 4],
  "maxCounts": [4, 2, 1],
  "targetAmount": 6
}
```

**Output**

```json
{
  "counts": [0, 2, 0],
  "totalCoins": 2
}
```

使用 2 枚面额为 3 的硬币可得 $0 \times 1 + 2 \times 3 + 0 \times 4 = 6$，最少共需 **2** 枚硬币。
