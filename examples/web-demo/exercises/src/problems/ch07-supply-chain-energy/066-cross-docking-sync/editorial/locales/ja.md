## アプローチ

トラックのドック割当 0-1 変数 ($x_{i,r}, y_{j,s}$) と積替フロー ($f_{i,j,k}$) の三重積を避けるため、ドック対に分解した連続フロー変数 $w_{i,j,r,s} \ge 0$ を導入し、さらに便間の積み替え有無を表す $z_{i,j} \in \{0, 1\}$ を用いて到着＋移動時間の出発同期制約を線形化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i,j,r,s} c_{r,s} w_{i,j,r,s} + \gamma_{\text{delay}} \sum_{j} T_j \\
\text{s.t.} \quad & \sum_{r} x_{i,r} = 1, \quad \sum_{i} x_{i,r} \le C^{\text{in}}_r && \forall i, r \\
& \sum_{s} y_{j,s} = 1, \quad \sum_{j} y_{j,s} \le C^{\text{out}}_s && \forall j, s \\
& \sum_{j} f_{i,j,k} \le A_{i,k}, \quad \sum_{i} f_{i,j,k} = B_{j,k} && \forall i, j, k \\
& \sum_{r,s} w_{i,j,r,s} = \sum_{k} f_{i,j,k} \le M_{i,j} z_{i,j} && \forall i, j \\
& \sum_{s} w_{i,j,r,s} \le M_{i,j} x_{i,r}, \quad \sum_{r} w_{i,j,r,s} \le M_{i,j} y_{j,s} && \forall i, j, r, s \\
& t_j \ge a_i + \tau_{r,s} - M_T (3 - x_{i,r} - y_{j,s} - z_{i,j}) && \forall i, j, r, s \\
& T_j \ge t_j - d_j, \quad T_j \ge 0 && \forall j
\end{aligned}
$$

ただし $M_{i,j} = \sum_k \min(A_{i,k}, B_{j,k})$、$M_T = \max_i a_i + \max_{r,s} \tau_{r,s}$ とします。

## ポイント

- **積を伴わないドック対荷役コストの線形化**: $\sum_r x_{i,r} = 1$ かつ $\sum_s y_{j,s} = 1$ のもとで $\sum_s w_{i,j,r,s} \le M_{i,j} x_{i,r}$ と $\sum_r w_{i,j,r,s} \le M_{i,j} y_{j,s}$ を課すと、連続変数 $w_{i,j,r,s}$ のみで実際に選ばれた $(r, s)$ ペアだけへフローを集約できます。
- **タイトな上界による時刻同期の Big-M**: ペアごとの積替可能上限 $M_{i,j}$ と時刻上限 $M_T$ をデータから厳密に算出し、過剰な Big-M による緩和劣化を抑えています。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各トラック対について積替フロー総和をドック対変数 $w_{i,j,r,s}$ に分解し、両端のドック割当と時刻同期の Big-M 制約を同時に課します。WaSHI では `map` と `flatMap` でドック対の配列制約を一括生成し、PuLP では二重ループで各 $(r, s)$ の制約を追加します。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${pairFlowSum} <= ${maxPairFlow} * ${z[i][j]}`);
m.constraint(expr`${sum(w[i][j].flat())} - ${pairFlowSum} == 0`);
m.constraint(
  w[i][j].map((row, r) => expr`${sum(row)} <= ${maxPairFlow} * ${x[i][r]}`)
);
m.constraint(
  input.outDoorCaps.map((_, s) =>
    expr`${sum(w[i][j].map((row) => row[s]))} <= ${maxPairFlow} * ${y[j][s]}`
  )
);
m.constraint(
  input.transferTimes.flatMap((row, r) =>
    row.map((tau, s) => {
      const rhs = input.arrivalTimes[i] + tau - 3 * bigMT;
      return expr`${dep[j]} - ${bigMT} * ${x[i][r]} - ${bigMT} * ${y[j][s]} - ${bigMT} * ${z[i][j]} >= ${rhs}`;
    })
  )
);
```

**PuLP (Python)**

```python
prob += pair_flow <= m_ij * z[i][j]
prob += pulp.lpSum(w[i][j][r][s] for r in range(R) for s in range(S)) == pair_flow
for r in range(R):
    prob += pulp.lpSum(w[i][j][r][s] for s in range(S)) <= m_ij * x[i][r]
for s in range(S):
    prob += pulp.lpSum(w[i][j][r][s] for r in range(R)) <= m_ij * y[j][s]
for r in range(R):
    for s in range(S):
        prob += dep[j] >= arrivals[i] + transfer_times[r][s] - big_m_t * (3 - x[i][r] - y[j][s] - z[i][j])
```
