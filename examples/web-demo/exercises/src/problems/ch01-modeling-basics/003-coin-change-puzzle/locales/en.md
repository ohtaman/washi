# #003. Coin Change Puzzle

<!-- section:scenario -->
You need to pay an exact target amount using a limited supply of coins. For each coin denomination, you know its face value and the maximum number of coins available, and you must choose an **integer** number of each coin (from zero up to its available cap) so that their total value equals the target amount while **minimizing the total number of coins** used.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `denominations` | `number[]` | Face value of each coin type |
| `maxCounts` | `number[]` | Maximum number of coins available per type |
| `targetAmount` | `number` | Exact total amount to form |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `counts` | `number[]` | Integer number of coins used for each type |
| `totalCoins` | `number` | Minimized total number of coins |

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

Using 2 coins of value 3 gives $0 \times 1 + 2 \times 3 + 0 \times 4 = 6$, for a total of $0 + 2 + 0 = 2$ coins.
