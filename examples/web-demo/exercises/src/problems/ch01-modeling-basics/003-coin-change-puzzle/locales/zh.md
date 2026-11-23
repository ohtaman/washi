# #003. 硬币找零谜题

<!-- section:scenario -->
你需要使用有限数量的硬币凑出精确的目标金额。对于每种硬币，已知其面额和可用的最大枚数，你必须为每种硬币选择 0 枚以上、不超过可用上限的**整数**枚数，使总金额恰好等于目标金额，同时**最小化硬币总枚数**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `denominations` | `number[]` | 每种硬币的面额 |
| `maxCounts` | `number[]` | 每种硬币可用的最大枚数 |
| `targetAmount` | `number` | 需要凑出的精确目标金额 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `counts` | `number[]` | 每种硬币使用的整数枚数 |
| `totalCoins` | `number` | 最小化后的硬币总枚数 |

<!-- section:example -->
**输入示例**

```json
{
  "denominations": [1, 3, 4],
  "maxCounts": [4, 2, 1],
  "targetAmount": 6
}
```

**输出示例**

```json
{
  "counts": [0, 2, 0],
  "totalCoins": 2
}
```

使用 2 枚面额为 3 的硬币可得总金额 $0 \times 1 + 2 \times 3 + 0 \times 4 = 6$，总枚数为 $0 + 2 + 0 = 2$ 枚。
