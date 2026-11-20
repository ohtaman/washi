# #049. SMT-LIRA モード切替と時間枠スケジューリング

<!-- section:scenario -->
物流センターの単一荷降ろしドックに到着する各便について、通常配送モードかエクスプレス配送モードのどちらを採用するか、および各便の連続値の開始・完了時刻を決定します。エクスプレスを選ぶと追加料金がかかりますが、専用時間枠と短い小数所要時間が適用されます（ただし選択できる総本数には整数上限があります）。

各便の処理区間はドックの保守休止時間帯と重なってはならず、単一ドック上でどの 2 便も時刻が重複できません。目標期限を過ぎた完了には単位時間あたりの遅延ペナルティが発生するため、総コスト（エクスプレス料金＋遅延ペナルティ）を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `shipments` | `ShipmentSpec[]` | 各便の通常/エクスプレス時間枠・所要時間・追加料金・期限・遅延ペナルティ係数 |
| `blackout` | `[number, number]` | ドックの保守休止時間帯 `[bStart, bEnd]` |
| `maxExpress` | `number` | エクスプレスを選択できる便数の整数上限 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `express` | `boolean[]` | 各便でエクスプレスを選ぶなら `true`、通常なら `false` |
| `startTimes` | `number[]` | 各便の連続荷降ろし開始時刻 |
| `endTimes` | `number[]` | 各便の連続荷降ろし完了時刻 |
| `totalCost` | `number` | 最小化されたエクスプレス料金＋遅延ペナルティ合計 |

<!-- section:example -->
**入力例**

```json
{
  "shipments": [
    {
      "stdWindow": [0, 6],
      "expWindow": [0, 6],
      "stdDuration": 2.5,
      "expDuration": 1.5,
      "expFee": 20,
      "dueTime": 3,
      "tardinessPenalty": 10
    },
    {
      "stdWindow": [0, 5],
      "expWindow": [0, 5],
      "stdDuration": 2,
      "expDuration": 1,
      "expFee": 15,
      "dueTime": 3,
      "tardinessPenalty": 12
    }
  ],
  "blackout": [3, 4],
  "maxExpress": 1
}
```

**出力例**

```json
{
  "express": [false, true],
  "startTimes": [0, 4],
  "endTimes": [2.5, 5],
  "totalCost": 39
}
```

便 0 は通常モードで休止前の `[0, 2.5]` に処理され（遅延 `0`）、便 1 はエクスプレスに切り替えて `[4, 5]` に処理されるため、料金 `15`＋遅延 `12 * (5 - 3) = 24` で合計 `39` となります。
