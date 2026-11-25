## アプローチ

各有向枝に非負の連続変数 `flows[e]`（上限 `edges[e].cap`）を割り当て、全頂点で「流出和 − 流入和 = 純供給量」というフロー保存則を課し、線形コスト和を最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{f} \quad & \sum_{e \in E} c_e f_e \\
\text{s.t.} \quad & \sum_{e=(v, w) \in E} f_e - \sum_{e=(u, v) \in E} f_e = b_v && \forall v \in V \\
& 0 \le f_e \le u_e && \forall e \in E
\end{aligned}
$$

## ポイント

- **全単模性（Total Unimodularity）**: 有向グラフの接続行列は各列に $+1$ と $-1$ を 1 つずつ持つため、任意の小行列の行列式が $0, +1, -1$ のいずれかになります。供給量 $b_v$ と容量 $u_e$ が整数であれば、整数制約を入れない純粋な連続 LP でも単体法（Simplex）が選ぶ頂点解は自動的に整数となります。
- **丸め不要の整数解**: 整数変数や `Math.round()` を使わずに連続変数の値そのままを返しても、厳密に整数フローが得られることを確認できます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各枝に連続変数 `flows[e]` を割り当て、`input.supplies.map` で各頂点の流出和と流入和の差が供給量 `supply` に一致する保存則制約をまとめて登録します。

**WaSHI (TypeScript)**

```ts
const flows = input.edges.map((e, i) =>
  m.continuous(`f_${i}`, { lb: 0, ub: e.cap })
);
m.constraint(
  input.supplies.map((supply, v) => {
    const outFlows = flows.filter((_, i) => input.edges[i].from === v);
    const inFlows = flows.filter((_, i) => input.edges[i].to === v);
    return expr`${sum(outFlows)} - ${sum(inFlows)} == ${supply}`;
  })
);
```

**PuLP (Python)**

```python
flows = [
    pulp.LpVariable(f"f_{i}", lowBound=0, upBound=e["cap"], cat=pulp.LpContinuous)
    for i, e in enumerate(edges)
]
for v in range(n):
    out_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["from"] == v)
    in_flow = pulp.lpSum(flows[i] for i, e in enumerate(edges) if e["to"] == v)
    prob += out_flow - in_flow == supplies[v]
```
