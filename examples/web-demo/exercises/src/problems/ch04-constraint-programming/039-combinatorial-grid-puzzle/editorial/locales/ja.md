## アプローチ

`[1, N]` の有界整数変数の $N \times N$ 配列 `grid[r][c]` を用意し、全行・全列・全ケージに `distinct()`、各ケージに和の等式 `sum(...) == targetSum`、ヒントに固定等式を設定して、目的関数なしで `await m.solve({ solver: "pumpkin" })` を実行します。

## 数理モデル

$$
\begin{aligned}
\text{find} \quad & g_{r,c} \in \{1, \dots, N\} && \forall r, c \in \{0, \dots, N-1\} \\
\text{s.t.} \quad & \text{AllDifferent}(g_{r,0}, \dots, g_{r,N-1}) && \forall r \\
& \text{AllDifferent}(g_{0,c}, \dots, g_{N-1,c}) && \forall c \\
& g_{r,c} = v && \forall (r, c, v) \in \text{givens} \\
& \sum_{(r,c) \in S_k} g_{r,c} = T_k, \quad \text{AllDifferent}\big(\{g_{r,c} \mid (r,c) \in S_k\}\big) && \forall k
\end{aligned}
$$

## ポイント

- **目的関数なしの充足可能性モデル**: CP では最適化するスカラー指標がなくても、制約伝播と節学習によって高速に実行可能解を見つけられます。`m.objective(...)` を省略したまま `await m.solve({ solver: "pumpkin" })` を呼ぶだけで求解できます。
- **`distinct` と `sum` の協調伝播**: ケージ和の制約が候補数字の組を絞り、行・列の `distinct` が交差するケージの候補を連鎖的に削減します。
- 関連リファレンス: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks) / [解の状態に関する用語](?view=guide&lang=ja#solver-status)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(grid.map((row) => distinct(row)));
m.constraint(
  Array.from({ length: n }, (_, c) => distinct(grid.map((row) => row[c])))
);
m.constraint(input.givens.map(([r, c, val]) => expr`${grid[r][c]} == ${val}`));
m.constraint(
  input.cages.map((cage) => expr`${sum(cage.cells.map(([r, c]) => grid[r][c]))} == ${cage.targetSum}`)
);
m.constraint(
  input.cages.map((cage) => distinct(cage.cells.map(([r, c]) => grid[r][c])))
);
await m.solve({ solver: "pumpkin" });
```
