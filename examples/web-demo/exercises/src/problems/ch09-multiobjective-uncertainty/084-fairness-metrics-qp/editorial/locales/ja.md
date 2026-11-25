## アプローチ

各チームの配分量を表す連続変数 $x_i \in [l_i, u_i]$ を宣言し、総需要の一致制約 $\sum_i x_i = D$ のもとで、凸二次目的関数 $\sum_i c_i x_i + \lambda \sum_i (x_i - \bar{x})^2$（ただし $\bar{x} = D / n$ は既知の平均配分量）を HiGHS 凸 QP として直接最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{x} \quad & \sum_{i=0}^{n-1} c_i x_i + \lambda \sum_{i=0}^{n-1} \left(x_i - \bar{x}\right)^2 \qquad \left(\bar{x} = \frac{D}{n}\right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = D \\
& l_i \le x_i \le u_i && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **公平性指標の比較**: 純コスト総和（$\lambda = 0$）は安価なチームに上限 $u_i$ まで偏り、配分が極端に不均衡になります。LP で書けるマックスミン（$\max \min_i x_i$）やレンジ（$\max_i x_i - \min_i x_i$）も両端のチームしか制約できず中間層の偏りが残りがちです。一方、L2 分散ペナルティ（$\lambda \sum_i (x_i - \bar{x})^2$）は $\lambda > 0$ で狭義凸となり、全チームを同時に平均 $\bar{x}$ 付近へ滑らかに平準化した一意の最適解が得られます。
- **WaSHI の `QuadExpr` と定数項処理**: $(x_i - \bar{x})^2 = x_i^2 - 2\bar{x}x_i + \bar{x}^2$ は半正定値対角ヘッセ行列 $2\lambda I \succeq 0$ を持ちます。WaSHI の `expr` テンプレートリテラルで二乗偏差の総和をそのまま `QuadExpr` として構築でき、HiGHS が定数オフセット $\lambda n \bar{x}^2$ も含めて正確に求解します。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

平均配分量 `mean` は入力定数として事前計算し、`minAlloc.map(...)` で上下限付きの連続変数を生成したうえで、二乗偏差 $(x_i - \bar{x})^2$ を `expr` でそのまま凸 2 次目的関数として渡します。

**WaSHI (TypeScript)**

```ts
const mean = input.totalDemand / n;
const x = input.minAlloc.map((lb, i) =>
  m.continuous({ lb, ub: input.maxAlloc[i], name: `x_${i}` })
);
m.constraint(expr`sum(${x}) == ${input.totalDemand}`, "total_demand");
m.objective(
  minimize(
    expr`dot(${input.unitCosts}, ${x}) + ${input.fairnessWeight} * sum((${x} - ${mean})^2)`
  )
);
await m.solve();
```
