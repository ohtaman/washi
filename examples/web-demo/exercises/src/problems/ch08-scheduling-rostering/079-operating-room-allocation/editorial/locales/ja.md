## アプローチ

症例 $c$ を手術室 $r$・枠 $s$ に割り当てる 0-1 変数 $x_{c,r,s} \in \{0, 1\}$（不適合室は 0 固定）と、ブロックごとの連続延長変数 $o_{r,s} \in [0, O_{\max}]$ を用意します。各症例を最大 1 回まで割り当て、各枠の手術時間合計を $B + o_{r,s}$ 以下に抑えつつ、優先度合計から延長コストを引いた純スコアを最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{c=0}^{C-1} \sum_{r=0}^{R-1} \sum_{s=0}^{S-1} p_c x_{c,r,s} - c_{\text{ot}} \sum_{r=0}^{R-1} \sum_{s=0}^{S-1} o_{r,s} \\
\text{s.t.} \quad & \sum_{r=0}^{R-1} \sum_{s=0}^{S-1} x_{c,r,s} \le 1 && \forall c \\
& \sum_{s=0}^{S-1} x_{c,r,s} = 0 && \forall c, r : \text{compat}_{c,r} = 0 \\
& \sum_{c=0}^{C-1} d_c x_{c,r,s} \le B + o_{r,s} && \forall r, s \\
& 0 \le o_{r,s} \le O_{\max} && \forall r, s \\
& x_{c,r,s} \in \{0, 1\} && \forall c, r, s
\end{aligned}
$$

## ポイント

- **選択的受入（`<= 1`）と延長採算の判定**: 全症例の必須実施ではないため、延長時間を要する枠に追加するときは優先度利得 $p_c$ が延長ペナルティ $c_{\text{ot}} \cdot \Delta o$ を上回るか自動判定されます（入力例の症例 4 は $20 < 25$ のため見送られます）。
- **連続スラック変数 $o_{r,s}$ による弾力容量**: $B + o_{r,s}$（$0 \le o_{r,s} \le O_{\max}$）と書くだけで、追加の 0-1 変数を使わずに定時超過の線形ペナルティを表現できます。
- **適合マスクの活用**: `compatible[c][r] == 0` の変数を 0 に固定することで、設備非対応の割当を防ぎつつ探索木を削減できます。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
x.forEach((caseRooms, c) => {
  m.constraint(expr`${sum(caseRooms.flat())} <= 1`);
  caseRooms.forEach((roomSessions, r) => {
    if (input.compatible[c][r] === 0) m.constraint(expr`${sum(roomSessions)} == 0`);
  });
});
for (let r = 0; r < R; r++) {
  for (let s = 0; s < S; s++) {
    const load = sum(x.map((caseRooms, c) => expr`${input.durations[c]} * ${caseRooms[r][s]}`));
    m.constraint(expr`${load} <= ${input.regularCapacity} + ${overtime[r][s]}`);
  }
}
```

**PuLP (Python)**

```python
for c in range(num_cases):
    prob += pulp.lpSum(x[c][r][s] for r in range(num_rooms) for s in range(num_sessions)) <= 1
    for r in range(num_rooms):
        if compatible[c][r] == 0:
            prob += pulp.lpSum(x[c][r]) == 0
for r in range(num_rooms):
    for s in range(num_sessions):
        prob += pulp.lpSum(durations[c] * x[c][r][s] for c in range(num_cases)) <= reg_cap + overtime[r][s]
```
