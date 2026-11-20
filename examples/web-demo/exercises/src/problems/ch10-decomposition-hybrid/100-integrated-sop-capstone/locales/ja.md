# #100. 統合 S&OP ポリシー監査＆最小攪乱リスケジューリング（総仕上げ）

<!-- section:scenario -->
生産販売統合計画（S&OP）の実務では、設備上の譲れない必須制約と、現場・営業部門からの重み付きソフト方針が同時に与えられ、方針どうしが矛盾したり需要を満たす生産容量が確保できなくなることがあります。最適生産計画を立てる前に、まず最小限の犠牲で方針矛盾を解消しなければなりません。

2 段階の WaSHI ハイブリッド解法を構築してください。第 1 段階では Z3 SMT の充足可能性判定と不可充足コア抽出（unsatCore）を用いた最小重みヒットセット探索で、必須制約と需要総容量を満たすために解除すべきソフトポリシーの総重みを最小化します。第 2 段階では修復後の有効ルールのもとで、固定稼働費・変動生産費・基準計画からの変更ペナルティの総和を最小化する生産配分 MIP を HiGHS で解きます。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `capacities` | `number[]` | 稼働時の各ライン $i$ の最大生産能力 |
| `fixedCosts` | `number[]` | 各ライン $i$ の固定稼働コスト |
| `prodCosts` | `number[]` | 各ライン $i$ の単位生産コスト |
| `demand` | `number` | 満たすべき総需要量 |
| `baselineActive` | `number[]` | 既存の基準稼働計画（0/1 ベクトル） |
| `disruptionPenalty` | `number` | 基準計画と異なる稼働状態に変更したライン 1 本あたりの変更ペナルティ |
| `hardRules` | `PolicyRule[]` | 必ず遵守すべきハード制約 |
| `softRules` | `Array<PolicyRule & { weight: number }>` | 解除コスト重み付きのソフト方針ルール |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `droppedPolicies` | `string[]` | 最小重み修復のために解除したソフトルール ID の配列 |
| `activeAssignments` | `number[]` | 残存ルールを満たす最適な 0/1 稼働ベクトル |
| `quantities` | `number[]` | 各ラインへの連続生産配分量 |
| `totalCost` | `number` | 固定稼働費＋変動生産費＋変更ペナルティの最小合計 |

<!-- section:example -->
**入力例**

```json
{
  "capacities": [40, 50, 45, 35],
  "fixedCosts": [120, 150, 130, 100],
  "prodCosts": [10, 8, 9, 12],
  "demand": 90,
  "baselineActive": [1, 1, 0, 0],
  "disruptionPenalty": 40,
  "hardRules": [{ "id": "hard_min_backup", "type": "min_active", "lines": [2, 3] }],
  "softRules": [
    { "id": "soft_run_0", "type": "must_run", "line": 0, "weight": 25 },
    { "id": "soft_idle_2", "type": "must_idle", "line": 2, "weight": 10 },
    { "id": "soft_idle_3", "type": "must_idle", "line": 3, "weight": 18 }
  ]
}
```

**出力例**

```json
{
  "droppedPolicies": ["soft_idle_2"],
  "activeAssignments": [1, 1, 1, 0],
  "quantities": [0, 50, 40, 0],
  "totalCost": 1200
}
```

重みが最小の `soft_idle_2`（`10 < 18`）を解除すると `hard_min_backup` との矛盾が解消します。ライン稼働 `[1, 1, 1, 0]` のとき固定費 `400`＋生産費 `760`＋1 本の変更ペナルティ `40` で最小合計 **1200** を得ます。
