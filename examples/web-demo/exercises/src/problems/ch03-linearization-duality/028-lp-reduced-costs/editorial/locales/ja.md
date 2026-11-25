## アプローチ

各プロセスの稼働量を表す非負の連続決定変数 $x_j \ge 0$（`lb: 0`、上界なし）を導入し、各要求の最低生産要求制約 $\sum_j A_{kj} x_j \ge r_k$ のもとで総コスト $\sum_j c_j x_j$ を最小化する LP として定式化します。この LP を HiGHS で解き、各変数の被約費用を WaSHI では `v.reducedCost`、PuLP では `v.dj` から読み取ります。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} A_{kj} x_j \ge r_k && [\text{dual } \pi_k \ge 0] \quad \forall k \\
& x_j \ge 0 && \forall j
\end{aligned}
$$

## ポイント

- **被約費用の双対公式と最適性条件**: 制約の双対変数 $\pi \ge 0$ を用いると、各変数の被約費用は $\bar{c}_j = c_j - \sum_k \pi_k A_{kj}$ で表されます。$x_j \ge 0$ の最小化 LP の KKT 最適性条件により、最適基底に入る変数（$x_j > 0$）では $\bar{c}_j = 0$、下界（$x_j = 0$）に留まる変数では $\bar{c}_j \ge 0$ となり、特に**双対非退化**（主問題の最適解が一意）のもとでは厳密に $\bar{c}_j > 0$ となります。
- **感度・符号の一般化と価格付け**: 主問題が非退化な最適解の近傍では、現在の最適基底内において $\bar{c}_j$ は「プロセス $j$ の単位コストがどれだけ下がれば最適基底に参入できるか」の閾値であり、同時に $x_j$ を $0$ から増やしたときの局所的な総コストの限界増加率でもあります。より一般には、最小化 LP で有限上界に張り付く非基底変数では $\bar{c}_j \le 0$ となり、最大化 LP で下界に留まる非基底変数でも $\bar{c}_j \le 0$（利益係数が $\lvert\bar{c}_j\rvert$ 以上上がれば参入）となります。この価格付け条件は後半の章の**列生成法**で中心的な役割を果たします。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各プロセスの非負変数 `quantities` で最低生産要求制約と目的関数を登録して `m.solve()` を呼び出し、各変数から `.reducedCost`（PuLP では `.dj`）を抽出します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.minRequirements.map(
    (req, k) => expr`dot(${input.yields[k]}, ${quantities}) >= ${req}`
  )
);
m.objective(minimize(expr`dot(${input.costs}, ${quantities})`));
await m.solve();
const reducedCosts = quantities.map((v) => v.reducedCost!);
```

**PuLP (Python)**

```python
for k, req in enumerate(min_requirements):
    prob += pulp.lpDot(yields[k], quantities) >= req
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
reduced_costs = [0.0 if abs(v.dj) < 1e-9 else float(v.dj) for v in quantities]
```
