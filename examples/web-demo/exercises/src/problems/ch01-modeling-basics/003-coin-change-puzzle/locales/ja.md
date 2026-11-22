# #003. コインの両替パズル

<!-- section:scenario -->
手持ちの限られた枚数の硬貨を使って、ちょうど目標金額を支払います。各種類の硬貨について額面と利用可能な上限枚数が与えられており、0枚以上・上限枚数以下の**整数**枚数を選んで合計金額を目標金額と一致させつつ、**使用する硬貨の合計枚数を最小化**してください。

スターターコードには2つの意図的な不備があります。上限のない連続変数を使っている点と、目標金額に一致させる等式制約が抜けている点です。

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `denominations` | `number[]` | 各硬貨の額面 |
| `maxCounts` | `number[]` | 各硬貨の利用可能な上限枚数 |
| `targetAmount` | `number` | ちょうど作るべき目標金額 |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `counts` | `number[]` | 各硬貨の使用枚数（整数） |
| `totalCoins` | `number` | 最小化された硬貨の合計枚数 |

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

額面3の硬貨を2枚使うと $0 \times 1 + 2 \times 3 + 0 \times 4 = 6$ となり、最小合計枚数は **2** 枚です。
