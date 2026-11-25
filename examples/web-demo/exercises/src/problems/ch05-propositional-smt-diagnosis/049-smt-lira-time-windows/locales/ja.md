# #049. SMT-LIRA モード切替と時間枠スケジューリング

<!-- section:scenario -->
物流センターの単一荷降ろしドックに到着する各便について、配送モードと連続値の荷降ろし区間 `[start, end]` を以下の条件のもとで決定します。

- **モード選択と時間枠**: 各便は通常モード（追加料金なし）またはエクスプレスモード（追加料金 `expFee` が発生し、`expWindow` と `expDuration` が適用）のいずれかを選びます。荷降ろし区間 `[start, end]`（`end = start + duration`）全体が、選んだモードの時間枠 `[earliestStart, latestEnd]` に収まる必要があります。
- **エクスプレス上限**: エクスプレスモードを選べる便数は最大 `maxExpress` 本までです。
- **保守休止時間帯の回避**: 各便はドックの保守休止時間帯 `[bStart, bEnd]` を避け、`bStart` 以前（以下）に完了するか、`bEnd` 以降（以上）に開始する必要があります。
- **単一ドック上の非重複**: どの 2 便もドック上で処理区間が重複してはなりません（一方が他方の開始時刻以前に完了する必要があります）。
- **遅延ペナルティ**: 完了時刻が目標期限 `dueTime` を過ぎた場合、超過時間 1 単位あたり `tardinessPenalty` の連続線形ペナルティが発生します。

エクスプレス料金と遅延ペナルティの総コストを最小化するモード選択と開始・完了時刻を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `shipments` | `ShipmentSpec[]` | 各便の仕様（通常/エクスプレス時間枠 `stdWindow`・`expWindow`、所要時間 `stdDuration`・`expDuration`、追加料金 `expFee`、目標期限 `dueTime`、遅延ペナルティ係数 `tardinessPenalty`） |
| `blackout` | `[number, number]` | ドックの保守休止時間帯 `[bStart, bEnd]` |
| `maxExpress` | `number` | エクスプレスを選択できる便数の整数上限 |

各 `ShipmentSpec` は `{ stdWindow: [number, number], expWindow: [number, number], stdDuration: number, expDuration: number, expFee: number, dueTime: number, tardinessPenalty: number }` の形式であり、`stdWindow` と `expWindow` はその便の荷降ろし区間全体が収まるべき `[earliestStart, latestEnd]` の範囲を表します。

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

便 0 は通常モードで休止前の [0, 2.5] に処理され（遅延 0）、便 1 はエクスプレスに切り替えて [4, 5] に処理されるため、料金 15 ＋ 遅延 12 × (5 - 3) = 24 で合計 39 となります。


<!-- section:hint1 -->
各便について、モード選択（エクスプレスか通常か）を表す真偽値変数と、連続値の開始時刻・完了時刻・非負の遅延変数を設けます。エクスプレスモードでは所要時間が短縮され専用の時間枠が有効になり、すべての便は保守休止時間帯を避けつつドック上で重ならないようにスケジュールする必要があります。

<!-- section:hint2 -->
上限制約（`sum(expFlag).le(input.maxExpress)`）やエクスプレス料金などの算術式に使うため、各 `m.bool(...)` に `m.binary(...)` フラグを対応づけます。モード別の時間枠と所要時間は `implies(...)` と `not(...)` で表現し、保守休止時間帯の回避（$\text{end}_i \le b_{\text{start}}$ または $\text{start}_i \ge b_{\text{end}}$）と便間の非重複（$\text{end}_i \le \text{start}_j$ または $\text{end}_j \le \text{start}_i$）には `or(...)` と `expr` 不等式を直接使って、`await m.solve({ solver: "z3" })` で解きます。
