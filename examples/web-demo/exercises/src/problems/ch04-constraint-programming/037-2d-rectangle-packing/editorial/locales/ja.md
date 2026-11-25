## アプローチ

帯高さの安全な有限上界を `maxHeight = sum(heights)`（$H_{\max} = \sum_i h_i$）と置きます。各矩形の左下座標に有界整数変数 `x[i]`（`[0, stripWidth - widths[i]]`）と `y[i]`（`[0, maxHeight - heights[i]]`）を割り当て、すべてのペア `i < j` に 4 方向の選言制約 `or(...)`（左・右・下・上）を課して、`max(y[i] + heights[i])` を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & H = \max_{i} (y_i + h_i) \\
\text{s.t.} \quad & (x_i + w_i \le x_j) \lor (x_j + w_j \le x_i) \lor (y_i + h_i \le y_j) \lor (y_j + h_j \le y_i) && \forall i < j \\
& 0 \le x_i \le W - w_i, \quad 0 \le y_i \le H_{\max} - h_i, \quad x_i, y_i \in \mathbb{Z} && \forall i
\end{aligned}
$$

## ポイント

- **CP の選言制約 `or(...)` と MIP Big-M 法の比較**: MIP で同じ 4 択を書くにはペアごとに 4 つの 0-1 変数と大きな定数 $M_x, M_y$ が必要になり、$M_x, M_y$ が十分大きいとき LP 緩和では全 0-1 変数が $0.25$ をとって $(x_i, y_i) = (0, 0)$ を許すため下界が極端に弱くなります。CP では Big-M の緩みなしに、4 方向のうち 3 方向が否定された時点で残り 1 方向の境界を即座に伝播し、遅延節生成（LCG）で不可能な相対配置から競合節を学習して枝刈りします。
- **安全な有限高さ上界**: 全矩形の高さの和 `maxHeight = sum(heights)`（$H_{\max} = \sum_i h_i$）を用いることで、すべての実行可能解を確実に包含しつつ Pumpkin に必要な有限整数ドメインを与えられます。
- 関連リファレンス: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

すべての矩形ペア `i < j` について、左・右・下・上のいずれか 1 方向以上で分離される選言制約 `or(...)` を登録し、各矩形の上端高さの最大値を最小化します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.widths.flatMap((_, i) =>
    input.widths.slice(i + 1).map((__, off) => {
      const j = i + 1 + off;
      return or(
        expr`${x[i]} + ${input.widths[i]} <= ${x[j]}`,
        expr`${x[j]} + ${input.widths[j]} <= ${x[i]}`,
        expr`${y[i]} + ${input.heights[i]} <= ${y[j]}`,
        expr`${y[j]} + ${input.heights[j]} <= ${y[i]}`
      );
    })
  )
);
m.objective(minimize(max(y.map((yi, i) => expr`${yi} + ${input.heights[i]}`))));
```
