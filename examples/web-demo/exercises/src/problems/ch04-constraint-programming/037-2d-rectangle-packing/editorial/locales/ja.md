## アプローチ

各矩形の左下座標に有界整数変数 `x[i]`（`[0, stripWidth - widths[i]]`）と `y[i]`（`[0, maxHeight - heights[i]]`）を割り当て、すべてのペア `i < j` に 4 方向の選言制約 `or(...)`（左・右・下・上）を課して、`max(y[i] + heights[i])` を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & H = \max_{i} (y_i + h_i) \\
\text{s.t.} \quad & (x_i + w_i \le x_j) \lor (x_j + w_j \le x_i) \lor (y_i + h_i \le y_j) \lor (y_j + h_j \le y_i) && \forall i < j \\
& 0 \le x_i \le W - w_i, \quad 0 \le y_i \le H_{\max} - h_i, \quad x_i, y_i \in \mathbb{Z} && \forall i
\end{aligned}
$$

## ポイント

- **CP の選言制約 `or(...)` と MIP Big-M 法の比較**: MIP で同じ 4 択を書くにはペアごとに 4 つの 0-1 変数と大きな定数 $M$ が必要になり、LP 緩和では全 0-1 変数が $0.25$ をとって $(x_i, y_i) = (0, 0)$ を許すため下界が極端に弱くなります。CP では Big-M の緩みなしに遅延節生成（LCG）で不可能な相対配置を直接枝刈りします。
- **高さ上界のタイト化**: `maxHeight = sum(heights)` を用いることで、Pumpkin の有限整数ドメインを不必要に広げずに実行可能解を包含できます。
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
