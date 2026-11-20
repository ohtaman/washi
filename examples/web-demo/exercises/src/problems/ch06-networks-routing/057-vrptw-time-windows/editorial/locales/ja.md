## アプローチ

有向枝の選択を表す 0-1 変数 $x_{ij}$ ($i \ne j$) と各地点の作業開始時刻を表す連続変数 $t_i \in [a_i, b_i]$ を用意し、使用される枝 $(i, j)$ に沿って Big-M 不等式 $t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij})$ で時刻を伝播させ、デポへの帰着時刻も $b_0$ 以下に抑えます。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n} \sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{1, \dots, n\}, \qquad \sum_{j=1}^n x_{0j} = \sum_{i=1}^n x_{i0} \le K \\
& t_0 = a_0, \quad a_i \le t_i \le b_i, \quad 1 \le u_i \le n && \forall i \in \{1, \dots, n\} \\
& t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij}) && \forall i \in \{0, \dots, n\}, j \in \{1, \dots, n\}, i \ne j \\
& u_i + 1 - u_j \le n(1 - x_{ij}) && \forall i, j \in \{1, \dots, n\}, i \ne j \\
& t_i + s_i + d_{i0} \le b_0 + M_{i0}(1 - x_{i0}) && \forall i \in \{1, \dots, n\} \\
& x_{ij} \in \{0, 1\} && \forall i \ne j
\end{aligned}
$$

ただし $M_{ij} = \max(0, b_i + s_i + d_{ij} - a_j)$、$M_{i0} = \max(0, b_i + s_i + d_{i0} - b_0)$ です。

## ポイント

- **不等式による自然な待機表現**: $t_j = t_i + s_i + d_{ij}$ と等式にせず $t_j \ge t_i + s_i + d_{ij}$ とし、変数下界 $t_j \ge a_j$ を組み合わせることで「早着した車両が $a_j$ まで待機する」動作を線形に表現できます。
- **MTZ 訪問順ポテンシャルによるゼロ時間部分巡回路の排除**: 同位置顧客などで $s_i + d_{ij} = 0$ の場合、時刻単調性だけではコスト $0$ の顧客巡回路（`1 -> 2 -> 1`）が残ります。訪問順変数 $u_i \in [1, n]$ と $u_i + 1 - u_j \le n(1 - x_{ij})$ を併用することで、所要時間が 0 の場合でも部分巡回路を確実に排除できます。
- **タイトな Big-M 係数**: $t_i \le b_i, t_j \ge a_j$ を用いて最小限の $M_{ij}$ を計算すると LP 緩和が引き締まり、高速に解けます。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (let i = 1; i < n; i++) {
  const bigMi0 = Math.max(0, latest[i] + service[i] + dist[i][0] - latest[0]);
  m.constraint(
    expr`${t[i]} + ${service[i] + dist[i][0]} <= ${latest[0]} + ${bigMi0} * (1 - ${x[i][0]!})`
  );
  for (let j = 1; j < n; j++) {
    if (i !== j) {
      const bigMij = Math.max(0, latest[i] + service[i] + dist[i][j] - earliest[j]);
      m.constraint(
        expr`${t[i]} + ${service[i] + dist[i][j]} - ${t[j]} <= ${bigMij} * (1 - ${x[i][j]!})`
      );
      m.constraint(expr`${u[i]!} + 1 - ${u[j]!} <= ${n - 1} * (1 - ${x[i][j]!})`);
    }
  }
}
```

**PuLP (Python)**

```python
for i in range(1, n):
    mi0 = max(0, latest[i] + service[i] + dist[i][0] - latest[0])
    prob += t[i] + service[i] + dist[i][0] <= latest[0] + mi0 * (1 - x[i][0])
    for j in range(1, n):
        if i != j:
            mij = max(0, latest[i] + service[i] + dist[i][j] - earliest[j])
            prob += t[i] + service[i] + dist[i][j] - t[j] <= mij * (1 - x[i][j])
            prob += u[i] + 1 - u[j] <= (n - 1) * (1 - x[i][j])
```
