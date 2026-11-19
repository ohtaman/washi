# #001. ベーカリーの最初の一問

<!-- section:scenario -->
最初の1問です。お好みのランタイム（**WaSHI (TypeScript)** または **Python (highspy)**）のどちらかでコードを動かし、採点フィードバックの見方を体験しましょう。

あるベーカリーが、限られた小麦粉とバターを使って **クロワッサン** と **食パン** を焼き上げます（生産量はどちらも 0 以上）。解答欄の初期コードはほぼ完成していますが、1箇所だけ意図的に **利益を最小化** する設定になっています。

1. まずそのまま **「実行して採点」** を押してみてください（何も作らない利益 0 の解が出力され、**SUBOPTIMAL** になります）。
2. 目的関数の設定を **最小化（minimize）から最大化（maximize）に1語だけ直して** 再実行し、**AC** になることを確認しましょう。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `flourCap` | `number` | 小麦粉の上限 |
| `butterCap` | `number` | バターの上限 |
| `croissantProfit` | `number` | クロワッサン1個の利益 |
| `loafProfit` | `number` | 食パン1個の利益 |
| `croissantFlour` | `number` | クロワッサン1個の小麦粉消費量 |
| `croissantButter` | `number` | クロワッサン1個のバター消費量 |
| `loafFlour` | `number` | 食パン1個の小麦粉消費量 |
| `loafButter` | `number` | 食パン1個のバター消費量 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `croissants` | `number` | クロワッサンの生産数 |
| `loaves` | `number` | 食パンの生産数 |
| `totalProfit` | `number` | 最大化された総利益 |

<!-- section:example -->
**入力例**

```json
{
  "flourCap": 120,
  "butterCap": 70,
  "croissantProfit": 40,
  "loafProfit": 70,
  "croissantFlour": 2,
  "croissantButter": 1,
  "loafFlour": 3,
  "loafButter": 2
}
```

**出力例**

```json
{
  "croissants": 30,
  "loaves": 20,
  "totalProfit": 2600
}
```

クロワッサン 30 個・食パン 20 個を焼くと、小麦粉 120 とバター 70 をちょうど使い切って総利益 **2,600** が最大になります。

<!-- section:hint1 -->
WaSHI タブでは `m.objective(minimize(...))` の `minimize` を `maximize` に変更します（上部 `import` にはすでに両方入っています）。Python (`highspy`) タブでは `h.minimize(...)` を `h.maximize(...)` に変えます。

<!-- section:hint2 -->
1 語直しただけで解が `0` から `2600` に変わるだけでなく、**「制約は満たしているが最適ではない (`SUBOPTIMAL`)」** と **「制約違反 (`VIOLATION`)」** の違いに注目してください。実務のモデル開発でも、この切り分けがデバッグの起点になります。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & p_c c + p_l \ell \\
\text{s.t.} \quad & f_c c + f_l \ell \le F_{\text{cap}} \\
& b_c c + b_l \ell \le B_{\text{cap}} \\
& c, \ell \ge 0
\end{aligned}
$$
