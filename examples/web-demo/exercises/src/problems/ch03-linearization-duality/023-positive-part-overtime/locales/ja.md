# #023. 超過・不足ペナルティの正部線形化

<!-- section:scenario -->
サービスセンターでは複数期間にわたり、予測需要をまかなう通常稼働量を計画しています。各期には契約上の最低稼働量と設備上限があり、さらに全期間を通じた通常稼働量の合計にも上限が定められています。

通常稼働量がその期の需要を下回った不足分に対してのみ 1 単位あたりの残業・外注ペナルティが発生し、逆に需要を上回っても余剰分の返金やプラス評価はありません。すべての制約を満たしながら、**通常稼働コストと残業ペナルティの総和を最小化**してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `demands` | `number[]` | 各期 $t$ の需要 $d_t$ |
| `minRegular` | `number[]` | 各期 $t$ の最低保証通常稼働量 $L_t$ |
| `maxRegular` | `number[]` | 各期 $t$ の最大通常稼働能力 $U_t$ |
| `regularCosts` | `number[]` | 各期 $t$ の通常稼働単価 $r_t$ |
| `overtimePenalties` | `number[]` | 不足量 $\max(0, d_t - x_t)$ あたりの残業ペナルティ $p_t$ |
| `totalRegularCap` | `number` | 全期間の通常稼働量合計 $\sum_t x_t$ の上限 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `regular` | `number[]` | 各期の通常稼働量 $x_t$ |
| `shortage` | `number[]` | 各期の不足残業量 $\max(0, d_t - x_t)$ |
| `totalCost` | `number` | 最小化された総コスト |

<!-- section:example -->
**入力例**

```json
{
  "demands": [40, 60, 50],
  "minRegular": [10, 10, 10],
  "maxRegular": [50, 50, 50],
  "regularCosts": [20, 25, 18],
  "overtimePenalties": [50, 45, 55],
  "totalRegularCap": 100
}
```

**出力例**

```json
{
  "regular": [40, 10, 50],
  "shortage": [0, 50, 0],
  "totalCost": 4200
}
```

通常稼働量 `[40, 10, 50]` は合計 $100 \le 100$ かつ各期の上下界を満たし、不足量は `[0, 50, 0]` となるため、総コストは $(20 \times 40 + 25 \times 10 + 18 \times 50) + (45 \times 50) =$ **4,200** となります。
