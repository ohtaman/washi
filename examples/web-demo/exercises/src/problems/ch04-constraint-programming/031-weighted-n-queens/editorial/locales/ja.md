## アプローチ

各行のクイーンの列番号を有限整数変数 `cols[r]`（`0 .. N - 1`）で表し、`cols`、`cols[r] + r`、`cols[r] - r` の 3 つに `distinct()` を課すことで列と両対角線の攻撃をまとめて禁止し、要素参照 `at(costMatrix[r], cols[r])` の総和を Pumpkin で最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{r=0}^{N-1} C_{r, c_r} \\
\text{s.t.} \quad & \text{AllDifferent}(c_0, \dots, c_{N-1}) \\
& \text{AllDifferent}(c_0 + 0, \dots, c_{N-1} + (N - 1)) \\
& \text{AllDifferent}(c_0 - 0, \dots, c_{N-1} - (N - 1)) \\
& c_r \in \{0, \dots, N - 1\} \cap \mathbb{Z} && \forall r \in \{0, \dots, N - 1\}
\end{aligned}
$$

## ポイント

- **$\binom{N}{2}$ 本の不等式を 3 本の `distinct()` に集約**: 2 つのクイーン $(r_1, c_1), (r_2, c_2)$ が同じ対角線に乗るのは $c_1 + r_1 = c_2 + r_2$ または $c_1 - r_1 = c_2 - r_2$ のときに限られます。3 つの `distinct()` 制約にまとめることで Pumpkin の相異制約伝播を簡潔に活用できます。
- **要素インデックスによる目的関数**: $N^2$ 個の 0-1 変数 $x_{r,c}$ を張る代わりに、`at(costMatrix[r], cols[r])` によって整数変数 `cols[r]` で各行の重み配列を直接参照できます。
- 関連リファレンス: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

各行の列変数 `cols` と両方向の対角線式に対して `distinct()` を課し、`at(row, cols[r])` で参照したコストの総和を最小化して Pumpkin で解きます。

**WaSHI (TypeScript)**

```ts
const cols = m.integer(n, { lb: 0, ub: n - 1, prefix: "col" });

m.constraint(distinct(cols), "distinct_cols");
m.constraint(distinct(cols.map((c, r) => expr`${c} + ${r}`)), "distinct_diag_pos");
m.constraint(distinct(cols.map((c, r) => expr`${c} - ${r}`)), "distinct_diag_neg");

m.objective(minimize(sum(input.costMatrix.map((row, r) => at(row, cols[r])))));
await m.solve({ solver: "pumpkin" });
```
