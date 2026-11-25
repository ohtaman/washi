## アプローチ

各ユニットの出力 $x_i$ をバンドごとの分割変数 $x_{ik} \ge 0$ に分解し、0-1 バンド選択変数 $y_{ik} \in \{0, 1\}$ と組にして $\sum_k y_{ik} = 1$、$L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik}$、および総需要制約 $\sum_{i,k} x_{ik} \ge \text{demand}$ を課したうえで、固定費と変動費の合計 $\sum_{i,k} (F_{ik} y_{ik} + c_{ik} x_{ik})$ を最小化します。この凸包定式化により、不連続区間やバンド固有の固定費 $F_{ik}$・傾き $c_{ik}$ を Big-M なしでタイトに表現できます。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{k=0}^{K-1} \left(F_{ik} y_{ik} + c_{ik} x_{ik}\right) \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} y_{ik} = 1 && \forall i \in \{0, \dots, n-1\} \\
& L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik} && \forall i, k \\
& \sum_{i=0}^{n-1} \sum_{k=0}^{K-1} x_{ik} \ge \text{demand} \\
& y_{ik} \in \{0, 1\}, \quad x_{ik} \ge 0 && \forall i, k
\end{aligned}
$$

## ポイント

- **単一変数 $x_i$ ＋ Big-M より分割定式化が優れる理由**: 第 1 に、バンドごとに単位コストの傾き $c_{ik}$ が異なるため、目的関数を線形に保つには $x_{ik}$ への分割が必要です。第 2 に、仮に傾きがすべてのバンドで同一であっても、有界区間のもとで $L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik}$・$\sum_k y_{ik} = 1$・$y_{ik} \ge 0$ は拡張された $(x, y)$ 空間において**各ユニット $i$ 単体の**非連結なバンド和集合の**厳密な凸包（Balas の凸包定式化）**を与えます。ユニット間を結ぶ総需要制約 $\sum_{i,k} x_{ik} \ge \text{demand}$ を加えると全体の LP 緩和解自体は整数性を保証されなくなるものの、Big-M 定式化よりはるかに強い緩和が得られます。
- **停止状態の統一的な扱い**: 停止を $k=0$ の $[0, 0]$ バンドとして入力に含めることで、すべてのユニットに対して $\sum_k y_{ik} = 1$ と同じ形式で記述できます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各ユニットで 1 つのバンドだけを有効にする制約と、バンド別の指示変数 `y[i][k]` で出力変数 `x[i][k]` の上下界をスケールする凸包制約を `flatMap` で一括登録します。

**WaSHI (TypeScript)**

```ts
m.constraint(y.map((row) => expr`${sum(row)} == 1`));
m.constraint(
  input.bandLbs.flatMap((lbs, i) =>
    lbs.flatMap((lb, k) => [
      expr`${x[i][k]} >= ${lb} * ${y[i][k]}`,
      expr`${x[i][k]} <= ${input.bandUbs[i][k]} * ${y[i][k]}`,
    ])
  )
);
m.constraint(expr`${sum(x.flat())} >= ${input.demand}`, "demand");
```

**PuLP (Python)**

```python
for i in range(n_units):
    prob += pulp.lpSum(y[i]) == 1
    for k in range(n_bands):
        prob += x[i][k] >= band_lbs[i][k] * y[i][k]
        prob += x[i][k] <= band_ubs[i][k] * y[i][k]
prob += pulp.lpSum(x[i][k] for i in range(n_units) for k in range(n_bands)) >= demand
```
