# #005. 精密合金の配合設計（混合比率制約）

<!-- section:scenario -->
金属精錬工場では、数種類の原料地金を溶かし合わせて、ちょうど指定された目標バッチ重量の特殊合金を製造します。各原料には 1 kg あたりの材料単価・在庫上限・各化学元素の含有率が決まっています。

品質基準として、完成した合金における各元素の重量比率は、それぞれ定められた下限と上限の範囲内に収まらなければなりません。在庫上限と品質基準をすべて満たしながら、**総材料費を最小化する各原料の使用量**を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `targetBatch` | `number` | 製造すべき合計バッチ重量 (kg) |
| `costs` | `number[]` | 原料 $i$ の単価 (/kg) |
| `availabilities` | `number[]` | 原料 $i$ の在庫上限 (kg) |
| `compositions` | `number[][]` | `compositions[i][k]` は原料 $i$ に含まれる元素 $k$ の含有率 |
| `minRatios` | `number[]` | 元素 $k$ の必要最低含有率 |
| `maxRatios` | `number[]` | 元素 $k$ の許容最大含有率 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `amounts` | `number[]` | 各原料の使用量 (kg) |
| `totalCost` | `number` | 最小化された総材料コスト |

<!-- section:example -->
**入力例**

```json
{
  "targetBatch": 100,
  "costs": [300, 500, 400],
  "availabilities": [80, 60, 70],
  "compositions": [
    [0.2, 0.5, 0.1],
    [0.6, 0.2, 0.4],
    [0.4, 0.4, 0.2]
  ],
  "minRatios": [0.35, 0.3, 0],
  "maxRatios": [1, 1, 0.25]
}
```

**出力例**

```json
{
  "amounts": [62.5, 37.5, 0],
  "totalCost": 37500
}
```

最も安価な原料 0 だけでは元素 0 の割合が 20% にとどまり下限 35% を満たせません。原料 0 を 62.5 kg、原料 1 を 37.5 kg 配合すると、元素 0 が 35%・元素 1 が 38.75%・元素 2 が 21.25% となり、最小コスト **37,500** で規格を満たします。

<!-- section:hint1 -->
「$\frac{\sum_i p_{i,k} x_i}{\sum_i x_i} \ge L_k$」は一見すると割り算を含む非線形制約に見えます。しかしこの問題では総重量 $\sum_i x_i$ が定数 `targetBatch` に固定されているため、両辺に `targetBatch` を掛けることで純粋な線形制約になります。

<!-- section:hint2 -->
変数 `amounts`（在庫上界つき）の宣言は用意済みです。合計重量の等式 `sum(amounts) == targetBatch` と、各元素 $k$ に対して次の 2 本の制約を追加してください：
- `elemWeight_k >= minRatios[k] * targetBatch`
- `elemWeight_k <= maxRatios[k] * targetBatch`

<!-- section:formulation -->
$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = B \\
& L_k B \le \sum_{i=0}^{n-1} p_{i,k} x_i \le U_k B && \forall k \\
& 0 \le x_i \le A_i && \forall i
\end{aligned}
$$

割合制約の分母がバッチ総量 $B$ として固定されている間は分母を払うだけで LP に落ちます。（分母も変数になる分数計画の扱いは第 2 章で詳しく扱います。）
