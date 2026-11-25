## アプローチ

各辺の選択を表す 0-1 変数 $x_{ij}$ に対して各顧客の入次数・出次数 $= 1$、デポの出次数 $=$ 入次数 $\le K$ を課し、顧客 $i \ge 1$ の累積積載量を表す連続変数 $u_i \in [d_i, Q]$ に MTZ 型の積載伝播制約 $u_i - u_j + Q x_{ij} \le Q - d_j$ を課して容量制約と部分巡回路排除を同時に実現します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n} \sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{1, \dots, n\} \\
& \sum_{j=1}^{n} x_{0j} = \sum_{i=1}^{n} x_{i0} \le K \\
& u_i - u_j + Q x_{ij} \le Q - \text{demands}[j] && \forall i \ne j \in \{1, \dots, n\} \\
& x_{ij} \in \{0, 1\}, \quad \text{demands}[i] \le u_i \le Q
\end{aligned}
$$

## ポイント

- **積載量変数の二役**: TSP の MTZ 制約の $+1$ を需要量 $d_j$ に置き換えるだけで、「ルート全体の積載量 $\le Q$」と「デポを含まない部分巡回路の禁止（正の需要が一周して増える矛盾）」の両方を一挙に表現できます。
- **過不足のないタイトな Big-M**: $x_{ij} = 0$ のとき $u_i \le Q, u_j \ge d_j$ より $u_i - u_j \le Q - d_j$ が常に成り立つため、係数 $Q$ は数学的に最もタイトな有効係数になります。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

顧客インデックス配列 `customers` に対して `flatMap` と `filter` で異なる顧客ペアを列挙し、容量ベースの MTZ 制約を一括登録します。これにより積載量上限と部分巡回路排除を同時に強制できます。

**WaSHI (TypeScript)**

```ts
const customers = Array.from({ length: n - 1 }, (_, k) => k + 1);
m.constraint(
  customers.flatMap((i) =>
    customers
      .filter((j) => i !== j)
      .map((j) => expr`${u[i]!} - ${u[j]!} + ${Q} * ${x[i][j]!} <= ${Q - input.demands[j]}`)
  )
);
```

**PuLP (Python)**

```python
for i in range(1, n):
    for j in range(1, n):
        if i != j:
            prob += u[i] - u[j] + cap * x[i][j] <= cap - demands[j]
```
