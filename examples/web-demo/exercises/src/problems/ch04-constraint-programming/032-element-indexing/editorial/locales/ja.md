## アプローチ

各作業に 1 つの有界整数変数 `assignment[i]`（`0 .. m - 1`）を用意し、`distinct(assignment)` で機械の重複を防いだうえで、変数添字の配列参照 `at(input.costs[i], assignment[i])` の和を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_{i,\, a_i} \\
\text{s.t.} \quad & \text{AllDifferent}(a_0, \dots, a_{n-1}) \\
& a_i \in \{0, \dots, m - 1\} \cap \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **Element 制約 `at()` と 0-1 割当行列（#007 型の定式化）の対比**: `#007`（正方 $n \times n$）のような 0-1 行列 MIP を長方形 $n \times m$ 問題へ適用すると $n \times m$ 個のバイナリ変数が必要になりますが、CP ではたった $n$ 個の整数変数で済み、目的関数のコスト参照 $c_{i, a_i}$ をそのまま Pumpkin の `element` プロパゲータへ渡せます。
- **0 始まりインデックスと長方形行列への対応**: `at(array, idx)` は $0 \le \text{idx} < \text{array.length}$ を自動で保証し、$n < m$（余剰機械あり）の場合でもダミー行なしでそのまま書けます。
- 関連リファレンス: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

各作業の機械番号を表す整数変数配列 `assignment` に `distinct` 制約を課し、`at(row, assignment[i])` で参照したコストの総和を最小化して Pumpkin で解きます。

**WaSHI (TypeScript)**

```ts
const assignment = m.integer(n, { lb: 0, ub: numMachines - 1, prefix: "assign" });

m.constraint(distinct(assignment), "distinct_machines");
m.objective(minimize(sum(input.costs.map((row, i) => at(row, assignment[i])))));
await m.solve({ solver: "pumpkin" });
```
