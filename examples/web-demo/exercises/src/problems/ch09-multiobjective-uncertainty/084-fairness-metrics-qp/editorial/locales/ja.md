## アプローチ

各チームの許容上下界 `[minAlloc[i], maxAlloc[i]]` を持つ連続変数 `x` を宣言し、総和制約 `sum(x) == totalDemand` のもとで `dot(unitCosts, x) + fairnessWeight * sum((x - mean)^2)`（ただし $\bar{x} = \text{totalDemand} / n$）を HiGHS 凸 QP として直接最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{x} \quad & \sum_{i=0}^{n-1} c_i x_i + \lambda \sum_{i=0}^{n-1} \left(x_i - \bar{x}\right)^2 \qquad \left(\bar{x} = \frac{D}{n}\right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = D \\
& l_i \le x_i \le u_i && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **公平性指標の比較（総和・マックスミン・レンジ・L2 分散）**:
  - **純コスト総和**（$\lambda = 0$）: 安価なチームに上限 $u_i$ まで偏り、不均衡が最大化します。
  - **マックスミン（$\max \min_i x_i$）やレンジ（$\max_i x_i - \min_i x_i$）**: LP で書けますが、両端のチームしか制約せず中間層の偏りが残りがちです。
  - **L2 分散（$\lambda \sum_i (x_i - \bar{x})^2$）**: $\lambda > 0$ で強凸となり、全チームを同時に平均 $\bar{x}$ 付近へ滑らかに平準化した一意の最適解が得られます。
- **WaSHI の `QuadExpr` と定数項処理**: $(x_i - \bar{x})^2 = x_i^2 - 2\bar{x}x_i + \bar{x}^2$ は正定値対角ヘッセ行列 $2\lambda I$ を持ち、``expr`sum((${x} - ${mean})^2)` `` で直接記述でき、HiGHS が定数オフセット $\lambda n \bar{x}^2$ も含めて正確に求解します。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

平均配分量 `mean` は入力定数として事前計算し、`minAlloc.map(...)` で上下限付きの連続変数を生成したうえで、`expr` の二乗記法 `(x - mean)^2` をそのまま凸 2 次目的関数として渡します。

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
