## アプローチ

0-1 の稼働変数 `active[i]` と連続変数 `levels[i]` を組み合わせ、`minLevels[i] * active[i] <= levels[i] <= maxLevels[i] * active[i]` で条件付き範囲を表したうえで、各論理条件を線形不等式に直して純利益を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} \left( r_i x_i - F_i y_i \right) \\
\text{s.t.} \quad & L_i y_i \le x_i \le U_i y_i && \forall i \\
& \sum_{i=0}^{n-1} x_i \le B \\
& y_a \le y_b && \forall (a, b) \in \mathcal{P} \\
& y_a + y_b - 1 \le y_c && \forall (a, b, c) \in \mathcal{J} \\
& y_u + y_v \le 1 && \forall (u, v) \in \mathcal{C} \\
& x_i \ge 0,\; y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## ポイント

- **論理命題の線形化定石**: 含意 $y_a \implies y_b$ は $y_a \le y_b$、連言含意 $(y_a \land y_b) \implies y_c$ は $y_a + y_b - 1 \le y_c$（$y_a = y_b = 1$ のときだけ右辺に 1 以上を強制）、排反 $\neg(y_u \land y_v)$ は $y_u + y_v \le 1$ としてそのまま線形制約になります。
- **タイトな Big-M と数値安定性**: 連続変数のオン・オフ制御では、むやみに大きな定数 $M$ を使わず、設備本来の稼働範囲 $L_i, U_i$ を使うことで LP 緩和が強くなり分岐限定法が高速化します。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  levels.map((lvl, i) => expr`${input.minLevels[i]} * ${active[i]} <= ${lvl}`)
);
m.constraint(
  levels.map((lvl, i) => expr`${lvl} <= ${input.maxLevels[i]} * ${active[i]}`)
);
m.constraint(input.prerequisites.map(([a, b]) => expr`${active[a]} <= ${active[b]}`));
m.constraint(
  input.conjunctions.map(([a, b, c]) => expr`${active[a]} + ${active[b]} - 1 <= ${active[c]}`)
);
m.constraint(input.conflicts.map(([u, v]) => expr`${active[u]} + ${active[v]} <= 1`));
```

**PuLP (Python)**

```python
for i in range(n):
    prob += min_levels[i] * active[i] <= levels[i]
    prob += levels[i] <= max_levels[i] * active[i]
for a, b in prerequisites:
    prob += active[a] <= active[b]
for a, b, c in conjunctions:
    prob += active[a] + active[b] - 1 <= active[c]
for u, v in conflicts:
    prob += active[u] + active[v] <= 1
```
