## アプローチ

各都市間の有向枝を表す 0-1 変数 $x_{ij}$ ($i \ne j$) に対して各都市の入次数・出次数 $= 1$ を課し、都市 $1 \dots n-1$ に連続ポテンシャル $u_i \in [1, n-1]$ を導入して MTZ 不等式 $u_i - u_j + n x_{ij} \le n - 1$ で部分巡回路を排除します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{0, \dots, n-1\} \\
& u_i - u_j + n x_{ij} \le n - 1 && \forall i \ne j \in \{1, \dots, n-1\} \\
& x_{ij} \in \{0, 1\}, \quad 1 \le u_i \le n - 1
\end{aligned}
$$

## ポイント

- **次数制約だけでは不十分な理由**: 入次数・出次数 $= 1$ は単なる閉路被覆しか保証しません。入力例でも `0 <-> 2`（コスト 5）と `1 <-> 3`（コスト 5）の 2 つの小ループに分かれるとコスト 10 になってしまい、1 本の巡回路（コスト 19）になりません。
- **MTZ 制約の仕組み**: 都市 0 以外の枝 $(i, j)$ を使うと（$x_{ij} = 1$）、$u_j \ge u_i + 1$ となって訪問順が厳密に増加します。そのため都市 0 を含まない部分巡回路を作ると「ポテンシャルが一周で増加して元に戻る」矛盾が生じ、すべての小ループが禁止されます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (let i = 1; i < n; i++) {
  for (let j = 1; j < n; j++) {
    if (i !== j) {
      m.constraint(expr`${u[i]!} - ${u[j]!} + ${n} * ${x[i][j]!} <= ${n - 1}`);
    }
  }
}
```

**PuLP (Python)**

```python
for i in range(1, n):
    for j in range(1, n):
        if i != j:
            prob += u[i] - u[j] + n * x[i][j] <= n - 1
```
