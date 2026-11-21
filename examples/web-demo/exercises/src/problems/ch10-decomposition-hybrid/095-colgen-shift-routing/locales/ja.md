# #095. 列生成法によるシフト・ロスタリング

<!-- section:scenario -->
計画期間中の各日に必要な最低人数を満たすよう、同質なスタッフの勤務シフトを編成します。採用された各スタッフの勤務パターンには固定の基本コストに加えて勤務日ごとの日当が発生し、総勤務日数には上限（最低 1 日以上）、さらに連続勤務日数にも上限が課されています。

WaSHI の列生成機能を用いて制約付き主問題から労働規則を満たす複数日シフトパターンを動的に価格付けし、整数計画として総人件費を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `demands` | `number[]` | 各日 $d$ に必要な最低配置人数 |
| `shiftCosts` | `number[]` | 各日 $d$ の出勤 1 人あたりの日別変動コスト |
| `baseCost` | `number` | 採用したシフト列 1 人分あたりの固定基本コスト |
| `maxConsecutive` | `number` | 1 つのシフトパターン内で許容される最大連続勤務日数 |
| `maxWorkDays` | `number` | 1 つのシフトパターン内で許容される総勤務日数上限 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `selectedColumns` | `number[][]` | 採用した 0/1 シフトパターンの配列（各要素の長さは `demands.length`） |
| `counts` | `number[]` | 各シフトパターンに割り当てる非負整数の人数 |
| `totalCost` | `number` | 総シフトコスト $\sum_p \text{counts}[p] \cdot (\text{baseCost} + \sum_d \text{shiftCosts}[d] \cdot a_{pd})$ |

<!-- section:example -->
**入力例**

```json
{
  "demands": [2, 3, 4, 3, 2],
  "shiftCosts": [12, 10, 11, 10, 13],
  "baseCost": 25,
  "maxConsecutive": 3,
  "maxWorkDays": 4
}
```

**出力例**

```json
{
  "selectedColumns": [
    [1, 0, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [1, 1, 1, 0, 1]
  ],
  "counts": [1, 2, 1],
  "totalCost": 254
}
```

各パターンは総勤務日数 `<= 4`、連続勤務日数 `<= 3` を満たしつつ日別需要 `[2, 3, 4, 3, 2]` をちょうど被覆し、総コストは `1 * 71 + 2 * 56 + 1 * 71 =` **254** となります。

<!-- section:hint1 -->
生成されたシフトパターンへの配置人数を決めて日別需要を満たす制約付き主問題（RMP）と、労働規則を満たす単一の複数日シフトパターンを生成する二値 MIP 価格付け子問題に分解します。初期 LP が実行可能になるよう、需要が正の各日について単日勤務の初期列を主問題に登録しておきます。

<!-- section:hint2 -->
名前付き制約 `demand_${d}` を持つ主問題で `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })` を呼び出します。`pricing({ getDual })` では二値変数 $a_d \in \{0,1\}$ に対し $1 \le \sum_d a_d \le \text{maxWorkDays}$ と長さ $\text{maxConsecutive}+1$ のスライディング窓制約を課して $\sum_d (\pi_d - \text{shiftCosts}[d]) a_d$ を最大化し、$\text{baseCost} - \text{sub.objectiveValue!} < -10^{-5}$ のとき新列を提案します。
