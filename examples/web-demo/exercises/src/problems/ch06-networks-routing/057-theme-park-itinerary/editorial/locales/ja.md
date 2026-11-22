## 考え方

移動アークをバイナリ変数 $x_{ij}$（$i \ne j$）で、各アトラクションでの体験開始時刻を連続変数 $t_i \in [a_i, b_i]$ で表します。選択された移動 $(i, j)$ についてタイトな Big-M 不等式 $t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij})$ で時刻を連結し、入口へ戻る $x_{i0} = 1$ の場合には閉園時刻制約 $t_i + s_i + d_{i0} \le b_0$ を課します。

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

ここで $M_{ij} = \max(0, b_i + s_i + d_{ij} - a_j)$、$M_{i0} = \max(0, b_i + s_i + d_{i0} - b_0)$ です。

## 重要ポイント

- **`<=` 連結による自動待機**: 時刻連結を等号ではなく $t_j \ge t_i + s_i + d_{ij}$ とし、下界 $t_j \ge a_j$ と組み合わせることで、早く到着したグループが開始時刻 $a_j$ まで待機する挙動を自然に表現できます。
- **MTZ 順序ポテンシャルによるゼロ時間部分巡回路の排除**: 同位置にあるアトラクション同士で $s_i + d_{ij} = 0$ の場合、時刻単調性だけでは入口を含まないゼロ時間の小ループ（`1 -> 2 -> 1`）を排除できません。訪問順ポテンシャル $u_i \in [1, n]$ と制約 $u_i + 1 - u_j \le n(1 - x_{ij})$ を加えることで、移動時間や体験時間が 0 でもすべての部分巡回路を防げます。
- **タイトな Big-M の計算**: $t_i \le b_i$ と $t_j \ge a_j$ の範囲を使うことで有効な最小の Big-M が得られ、LP 緩和が強くなります。
- 関連用語: [ガイド＆用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks)・[問題ファミリー](?view=guide&lang=ja#paradigms)

## 主要な実装

**WaSHI (TypeScript)**

```ts
for (let i = 1; i < n; i++) {
  const bigMi0 = Math.max(0, latest[i] + visitDurations[i] + travelTimes[i][0] - latest[0]);
  m.constraint(
    expr`${t[i]} + ${visitDurations[i] + travelTimes[i][0]} <= ${latest[0]} + ${bigMi0} * (1 - ${x[i][0]!})`
  );
  for (let j = 1; j < n; j++) {
    if (i !== j) {
      const bigMij = Math.max(0, latest[i] + visitDurations[i] + travelTimes[i][j] - earliest[j]);
      m.constraint(
        expr`${t[i]} + ${visitDurations[i] + travelTimes[i][j]} - ${t[j]} <= ${bigMij} * (1 - ${x[i][j]!})`
      );
      m.constraint(expr`${u[i]!} + 1 - ${u[j]!} <= ${n - 1} * (1 - ${x[i][j]!})`);
    }
  }
}
```

**PuLP (Python)**

```python
for i in range(1, n):
    mi0 = max(0, latest[i] + visit_durations[i] + travel_times[i][0] - latest[0])
    prob += t[i] + visit_durations[i] + travel_times[i][0] <= latest[0] + mi0 * (1 - x[i][0])
    for j in range(1, n):
        if i != j:
            mij = max(0, latest[i] + visit_durations[i] + travel_times[i][j] - earliest[j])
            prob += t[i] + visit_durations[i] + travel_times[i][j] - t[j] <= mij * (1 - x[i][j])
            prob += u[i] + 1 - u[j] <= (n - 1) * (1 - x[i][j])
```
