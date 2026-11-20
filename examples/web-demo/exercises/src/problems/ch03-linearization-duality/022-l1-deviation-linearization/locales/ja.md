# #022. 重み付き L1 偏差の線形化（目標追従）

<!-- section:scenario -->
運用担当者は、複数のチャネルへの非負の配分量を、各チャネルの上限以下・合計配分量の厳密一致・予算上限以下という条件のもとで決定する必要があります。各チャネルの理想目標値は予算制約や合計条件とそのままでは両立しない場合があるため、一部を増減させて調整します。

目標値からの上方・下方のズレにはチャネルごとの重み付きペナルティが課されます。すべての制約を満たしながら、**重み付き L1 偏差の合計を最小化**する配分を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `targets` | `number[]` | 各チャネル $i$ の目標値 $\tau_i$ |
| `weights` | `number[]` | 目標値からの単位ズレあたりペナルティ重み $w_i$ |
| `upperBounds` | `number[]` | 各チャネル $i$ の配分上限 $u_i$ |
| `costs` | `number[]` | 各チャネル $i$ の単位コスト $c_i$ |
| `budget` | `number` | 許容される総コスト上限 |
| `totalOutput` | `number` | 配分合計の必須値 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `allocations` | `number[]` | 各チャネルの配分量 $x_i$ |
| `totalDeviation` | `number` | 最小化された重み付き L1 偏差 $\sum_i w_i \lvert x_i - \tau_i \rvert$ |

<!-- section:example -->
**入力例**

```json
{
  "targets": [40, 30, 30],
  "weights": [3, 2, 1],
  "upperBounds": [60, 60, 60],
  "costs": [5, 2, 1],
  "budget": 230,
  "totalOutput": 100
}
```

**出力例**

```json
{
  "allocations": [25, 30, 45],
  "totalDeviation": 60
}
```

配分 `[25, 30, 45]` は合計 $100$、総コスト $5 \times 25 + 2 \times 30 + 1 \times 45 = 230 \le 230$ を満たし、重み付き偏差は $3 \lvert 25 - 40 \rvert + 2 \lvert 30 - 30 \rvert + 1 \lvert 45 - 30 \rvert =$ **60** です。
