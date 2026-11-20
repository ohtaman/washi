## アプローチ

各連続生産量 `quantities[i]` に 0-1 の稼働変数 `active[i]` を対応させ、両側からの連結不等式 `minBatches[i] * active[i] <= quantities[i] <= maxBatches[i] * active[i]` を課したうえで、共有資源上限のもとで総粗利益を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} m_i q_i \\
\text{s.t.} \quad & L_i y_i \le q_i \le U_i y_i && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} a_i q_i \le R \\
& q_i \ge 0,\; y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## ポイント

- **なぜ単純な下界 `lb` では表現できないか**: 変数宣言に `lb: L_i` を直接書くと「常に $q_i \ge L_i$」が強制され、資源節約のために生産をゼロにして別製品へ回す選択ができなくなります。
- **両側の連結制約（半連続変数）**: $L_i y_i \le q_i \le U_i y_i$ と書くと、$y_i = 0$ のとき $0 \le q_i \le 0$（停止）、$y_i = 1$ のとき $L_i \le q_i \le U_i$（最小ロット以上）となります。下側の制約を忘れると区間 $(0, L_i)$ の不正な少量生産が発生します。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  quantities.map((qty, i) => expr`${input.minBatches[i]} * ${active[i]} <= ${qty}`)
);
m.constraint(
  quantities.map((qty, i) => expr`${qty} <= ${input.maxBatches[i]} * ${active[i]}`)
);
```

**PuLP (Python)**

```python
for i in range(n):
    prob += min_batches[i] * active[i] <= quantities[i]
    prob += quantities[i] <= max_batches[i] * active[i]
prob += pulp.lpDot(usages, quantities) <= cap
```
