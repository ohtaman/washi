# #002. 2種類のアイスクリーム店（制約の追加）

<!-- section:scenario -->
あるアイスクリーム工房が、限られた **牛乳** と **砂糖** を使って **バニラ** と **チョコ** を製造します（生産量は 0 以上の連続値）。

初期コードには変数宣言、牛乳の上限制約、および利益最大化まで用意されていますが、**砂糖の上限制約だけが抜けています**。

1. まずそのまま実行すると、砂糖の在庫上限を超えるため **VIOLATION** になります。
2. 砂糖の消費量が在庫上限以下になる線形制約を 1 本追加して再実行し、**AC** を確認してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `milkCap` | `number` | 牛乳の在庫上限 |
| `sugarCap` | `number` | 砂糖の在庫上限 |
| `vanillaProfit` | `number` | バニラ 1 L の利益 |
| `chocoProfit` | `number` | チョコ 1 L の利益 |
| `vanillaMilk` | `number` | バニラ 1 L に必要な牛乳 |
| `vanillaSugar` | `number` | バニラ 1 L に必要な砂糖 |
| `chocoMilk` | `number` | チョコ 1 L に必要な牛乳 |
| `chocoSugar` | `number` | チョコ 1 L に必要な砂糖 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `vanilla` | `number` | バニラの生産量 (L) |
| `chocolate` | `number` | チョコの生産量 (L) |
| `totalProfit` | `number` | 最大化された総利益 |

<!-- section:example -->
**入力例**

```json
{
  "milkCap": 90,
  "sugarCap": 80,
  "vanillaProfit": 500,
  "chocoProfit": 300,
  "vanillaMilk": 3,
  "vanillaSugar": 1,
  "chocoMilk": 1,
  "chocoSugar": 2
}
```

**出力例**

```json
{
  "vanilla": 20,
  "chocolate": 30,
  "totalProfit": 19000
}
```

単価の高いバニラだけに絞ると牛乳が尽きて 30 L（利益 15,000）で頭打ちになりますが、バニラ 20 L とチョコ 30 L を組み合わせると牛乳 90・砂糖 80 を余さず使い切って総利益 **19,000** が最大になります。

<!-- section:hint1 -->
直上にある `milk` 制約の書き方をそのままコピーし、名前・係数・上限を `sugar` 用（`input.vanillaSugar`, `input.chocoSugar`, `input.sugarCap`）に書き換えてください。

<!-- section:hint2 -->
制約追加前の状態でチョコばかり作られた理由は、牛乳1単位あたりの利益がチョコ (`300/1=300`) ＞ バニラ (`500/3=166.7`) だったため、砂糖上限がないとチョコに全振りして `sugar=180 > 80` になってしまうからです。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & p_v v + p_c c \\
\text{s.t.} \quad & m_v v + m_c c \le M_{\text{cap}} \\
& s_v v + s_c c \le S_{\text{cap}} \\
& v, c \ge 0
\end{aligned}
$$
