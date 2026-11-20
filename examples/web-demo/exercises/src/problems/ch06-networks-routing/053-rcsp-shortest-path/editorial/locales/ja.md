## アプローチ

各方向付き枝に 0-1 変数 `x[e]` を用意し、始点から終点への単位フロー保存則と総資源上限 $\sum_e r_e x_e \le R$ を制約として課したうえで、コスト和 $\sum_e c_e x_e$ を最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{x \in \{0,1\}^{|E|}} \quad & \sum_{e \in E} c_e x_e \\
\text{s.t.} \quad & \sum_{e=(v, w)} x_e - \sum_{e=(u, v)} x_e = \begin{cases} 1 & v = s \\ -1 & v = t \\ 0 & \text{otherwise} \end{cases} && \forall v \in V \\
& \sum_{e \in E} r_e x_e \le R
\end{aligned}
$$

## ポイント

- **なぜ 0-1 変数（MIP）が必要になるか**: 資源制約のない最短路問題は全単模性により連続 LP で整数解が得られますが、資源上限制約を 1 本追加した瞬間に全単模性が崩れ、LP 緩和解では「低コストだが資源重い経路」と「高コストだが資源軽い経路」に小数フローを混ぜてしまうため 0-1 変数が不可欠になります。
- **閉路の排除**: すべての枝コストが正（$c_e > 0$）であれば、コスト最小化のもとで余分な孤立閉路を含む解は自然に排除されます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (let v = 0; v < input.nodeCount; v++) {
  const rhs = v === input.source ? 1 : v === input.sink ? -1 : 0;
  const outVars = x.filter((_, i) => input.edges[i].from === v);
  const inVars = x.filter((_, i) => input.edges[i].to === v);
  m.constraint(expr`${sum(outVars)} - ${sum(inVars)} == ${rhs}`);
}
m.constraint(
  expr`${sum(x.map((v, i) => expr`${input.edges[i].resource} * ${v}`))} <= ${input.maxResource}`
);
```

**PuLP (Python)**

```python
for v in range(n):
    rhs = 1 if v == s else (-1 if v == t else 0)
    out_x = pulp.lpSum(x[i] for i, e in enumerate(edges) if e["from"] == v)
    in_x = pulp.lpSum(x[i] for i, e in enumerate(edges) if e["to"] == v)
    prob += out_x - in_x == rhs
prob += pulp.lpSum(e["resource"] * x[i] for i, e in enumerate(edges)) <= max_r
```
