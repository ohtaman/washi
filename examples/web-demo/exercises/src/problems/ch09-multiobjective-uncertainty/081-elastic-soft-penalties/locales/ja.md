# #081. 弾力制約計画と優先度つきソフトペナルティ

<!-- section:scenario -->
ある工場では、複数品目の連続生産量を決定します。工場全体で消費する総稼働時間は機械能力の上限を超えてはならず、かつ全品目の総生産量は所定の必要下限以上である必要があります。

一方で、各品目には目標生産量が設定されており、目標を下回る不足分には優先度ティアに応じたペナルティが、目標を上回る超過分には超過ペナルティが 1 単位あたり課されます。ハード制約を厳守しつつ、生産コストと目標乖離ペナルティの合計を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `unitCosts` | `number[]` | 各品目 1 単位あたりの生産コスト |
| `hours` | `number[]` | 各品目 1 単位あたりの機械稼働時間 |
| `targets` | `number[]` | 各品目の目標生産量（ソフト目標） |
| `shortfallPenalties` | `number[]` | 目標不足 1 単位あたりの階層ペナルティ |
| `excessPenalties` | `number[]` | 目標超過 1 単位あたりのペナルティ |
| `machineCap` | `number` | 機械総稼働時間のハード上限 |
| `minTotal` | `number` | 全品目合計生産量のハード下限 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `quantities` | `number[]` | 各品目の非負連続生産量 |
| `shortfalls` | `number[]` | 各品目の目標に対する不足量 |
| `excesses` | `number[]` | 各品目の目標に対する超過量 |
| `totalCost` | `number` | 最小化された総生産費＋乖離ペナルティ |

<!-- section:example -->
**入力例**

```json
{
  "unitCosts": [4, 5, 3],
  "hours": [2, 2, 2],
  "targets": [10, 10, 10],
  "shortfallPenalties": [100, 50, 15],
  "excessPenalties": [20, 20, 20],
  "machineCap": 46,
  "minTotal": 0
}
```

**出力例**

```json
{
  "quantities": [10, 10, 3],
  "shortfalls": [0, 0, 7],
  "excesses": [0, 0, 0],
  "totalCost": 204
}
```

`quantities = [10, 10, 3]` は稼働時間 $2(10) + 2(10) + 2(3) = 46 \le 46$ と各品目の目標収支（`shortfalls = [0, 0, 7]`、`excesses = [0, 0, 0]`）を満たし、総費用は $(4 \times 10 + 5 \times 10 + 3 \times 3) + 15 \times 7 =$ **204** となります。
