# #010. 生産ライン稼働と固定費つき生産計画

<!-- section:scenario -->
工場では、いくつかの候補生産ラインのうちどれを稼働させるかと、稼働させたラインでどれだけ生産するかを同時に決定します。各ラインを稼働させると固定の段取り費が発生し、そのラインの最大能力まで連続量で生産できるようになります。逆に、**稼働させないラインでは一切生産できません**。

また、各ラインでの生産は 1 単位あたり所定の粗利益を生む一方で、工場全体で共有する原材料在庫を一定量ずつ消費します。原材料上限を守りつつ、総粗利益から固定費の合計を引いた **純利益を最大化** してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `margins` | `number[]` | 各ラインの 1 単位あたりの粗利益 |
| `fixedCosts` | `number[]` | 各ラインを稼働させたときに発生する固定費 |
| `capacities` | `number[]` | 各ラインの最大生産能力上限 |
| `materialUsages` | `number[]` | 各ライン 1 単位あたりの共有原材料消費量 |
| `materialCap` | `number` | 工場全体の共有原材料の総在庫上限 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `open` | `number[]` | 各ラインの稼働選択（`0` または `1`） |
| `quantities` | `number[]` | 各ラインの生産量（連続値） |
| `netProfit` | `number` | 最大化された純利益（粗利合計 − 固定費合計） |

<!-- section:example -->
**入力例**

```json
{
  "margins": [50, 40, 35],
  "fixedCosts": [600, 300, 250],
  "capacities": [30, 40, 25],
  "materialUsages": [2, 1.5, 1],
  "materialCap": 70
}
```

**出力例**

```json
{
  "open": [0, 1, 1],
  "quantities": [0, 30, 25],
  "netProfit": 1525
}
```

ライン 0 は単位利益が 50 と最も高いものの、材料効率（50/2 = 25）が低く固定費 600 も重いため稼働を見送り、ライン 1・2 を稼働させて `[0, 30, 25]` と生産すると純利益 **1,525** が最大になります。

<!-- section:hint1 -->
0-1 配列 `open` と連続配列 `quantities` は宣言済みです。各ライン $i$ について次の上限制約で「稼働と生産量」を結びつけます：
$$\text{quantities}[i] \le \text{capacities}[i] \cdot \text{open}[i]$$
`open[i] = 0` のとき右辺が `0` になるため、生産量も強制的に `0` に抑えられます。

<!-- section:hint2 -->
共有原料制約 `dot(input.materialUsages, quantities) <= input.materialCap` を追加し、目的関数 `dot(input.margins, quantities) - dot(input.fixedCosts, open)` を最大化してください。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} m_i q_i - \sum_{i=0}^{n-1} F_i y_i \\
\text{s.t.} \quad & 0 \le q_i \le C_i y_i && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} a_i q_i \le M_{\text{cap}} \\
& y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

連続変数と 0-1 変数を「$q_i \le C_i y_i$」でつなぐ構造は、第1章で学んだ LP と 0-1 計画の融合であり、第2章の Big-M 法・固定費ネットワークの基礎になります。
