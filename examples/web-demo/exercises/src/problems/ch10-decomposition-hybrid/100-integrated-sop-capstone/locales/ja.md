# #100. 統合 S&OP ポリシー監査＆最小攪乱リスケジューリング（総仕上げ）

<!-- section:scenario -->
化学・素材メーカーの生産販売統合計画（S&OP）において、生産ラインの稼働に関する設備上の必須制約と、現場・営業部門からの重み付きソフト方針が同時に与えられます。方針どうしが矛盾したり需要を満たす生産容量が確保できなくなる場合、生産計画を立てる前にまず最小限の重み犠牲で方針矛盾を解消しなければなりません。

Z3 SMT の矛盾解析と HiGHS の混合整数計画を用いた 2 段階ハイブリッド解法で解いてください。第 1 段階ではすべての必須制約と総需要容量を同時に満たすために解除すべき最小重みのソフト方針部分集合を特定し、第 2 段階では残存ルールのもとで固定稼働費・変動生産費・基準計画からの変更ペナルティの総和を最小化するライン稼働と生産量を決定します。

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

各 `PolicyRule` は `id: string` と以下のいずれかの `type` バリアントを持つタグ付きオブジェクトです（`line`・`lines`・`ifLine`・`thenLine` は 0 始まりのライン番号）:
- `"must_run"`: `{ id, type: "must_run", line: number }` — `active[line] === 1` を要求
- `"must_idle"`: `{ id, type: "must_idle", line: number }` — `active[line] === 0` を要求
- `"min_active"`: `{ id, type: "min_active", lines: number[] }` — `lines` のうち少なくとも 1 つで `active[idx] === 1` を要求
- `"implies"`: `{ id, type: "implies", ifLine: number, thenLine: number, thenActive: boolean }` — `active[ifLine] === 1` ならば `active[thenLine] === (thenActive ? 1 : 0)` を要求

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

重みが最小の `soft_idle_2`（$10 < 18$）を解除すると `hard_min_backup` との矛盾が解消します。ライン稼働 `[1, 1, 1, 0]` は総容量 $40 + 50 + 45 = 135 \ge 90$ を満たし、固定費 $120 + 150 + 130 = 400$、生産費 $8 \times 50 + 9 \times 40 = 760$、基準からの変更 1 本のペナルティ $40 \times 1 = 40$ の合計 $400 + 760 + 40 =$ **1,200** となります。

<!-- section:hint1 -->
問題を 2 つの連続する段階に分けます。第 1 段階では残存ルールと総容量で需要を満たせるように、解除すべき最小重みのソフトルール部分集合を求めます。第 2 段階では残ったルール集合を固定し、二値のライン稼働変数・連続生産量変数・`baselineActive` からの変更数を表す変数を持つ生産リスケジューリング MIP を解きます。

<!-- section:hint2 -->
第 1 段階では、Z3 が見つけた矛盾要因（UNSAT コア）をすべて少なくとも 1 つずつ解消する最小重みの解除集合を MIP で反復的に求める Implicit Hitting Set ループを回します。容量制約用の二値整数変数と連動するブール変数を持つ Z3 モデル（`await smt.check({ solver: "z3" })`）に `rule.id` で名前付けしたルールを課し、`status === "Unsat"` のたびに `res.unsatCore` に含まれるソフトルールからヒットセットカット（$\sum_{r \in \text{core} \cap \text{soft}} \text{drop}_r \ge 1$）を作って HiGHS の最小重み解除選択 MIP（$\sum_r w_r \text{drop}_r$ 最小化）へ追加します。第 2 段階では $\delta_i \ge y_i - \text{baseline}_i$ と $\delta_i \ge \text{baseline}_i - y_i$ で変更ペナルティを表現してください。
