## 解法のアプローチ

各ゲスト $i$ に対して招待を表す 0-1 変数 $y_i$（`invite[i]`）とギフト予算を表す連続変数 $g_i$（`giftBudget[i]`）を用意し、`minSpend`（$L_i$）と `maxSpend`（$U_i$）によるタイトな条件付き上下界 $L_i y_i \le g_i \le U_i y_i$ を課します。さらに総予算 $B$（`budget`）のもとで、`implications`（$\mathcal{I}$）・`conflicts`（$\mathcal{C}$）・`groupRules`（$(G_r, k_r)$）を $y_i$ 上の線形不等式として記述し、`baseEnjoyment`（$e_i$）と `bonusRates`（$r_i$）による楽しさの合計を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} \left( e_i y_i + r_i g_i \right) \\
\text{s.t.} \quad & L_i y_i \le g_i \le U_i y_i && \forall i \\
& \sum_{i=0}^{n-1} g_i \le B \\
& y_a \le y_b && \forall (a, b) \in \mathcal{I} \\
& y_u + y_v \le 1 && \forall (u, v) \in \mathcal{C} \\
& \sum_{i \in G_r} y_i \ge k_r && \forall r \\
& g_i \ge 0,\; y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## ポイント

- **0-1変数による論理制約の線形化**: 含意 $y_a \implies y_b$ は $y_a \le y_b$、競合 $\neg(y_u \land y_v)$ は $y_u + y_v \le 1$、グループ下限は $\sum_{i \in G_r} y_i \ge k_r$ という線形不等式で表現できます。
- **タイトな Big-M の重要性**: $g_i$ の上界に巨大な定数 $M$ ではなく実際の最大予算 $U_i$ を使う（$L_i y_i \le g_i \le U_i y_i$）ことで、LP緩和が引き締まり、分枝限定法の探索効率と数値安定性が大きく向上します。
- 関連用語: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types)、[問題の分類](?view=guide&lang=ja#paradigms)。

## 実装の勘所

各ゲストのギフト予算を招待フラグと上下限で連結し、含意・競合・グループ下限の各ルールを `invite` 変数上の線形不等式として順次追加します。

**WaSHI (TypeScript)**

```ts
m.constraint(giftBudget.map((g, i) => expr`${input.minSpend[i]} * ${invite[i]} <= ${g}`));
m.constraint(giftBudget.map((g, i) => expr`${g} <= ${input.maxSpend[i]} * ${invite[i]}`));
m.constraint(input.implications.map(([a, b]) => expr`${invite[a]} <= ${invite[b]}`));
m.constraint(input.conflicts.map(([u, v]) => expr`${invite[u]} + ${invite[v]} <= 1`));
m.constraint(
  input.groupRules.map((rule) => expr`${sum(rule.guests.map((i) => invite[i]))} >= ${rule.minCount}`)
);
```

**PuLP (Python)**

```python
for i in range(n):
    prob += min_spend[i] * invite[i] <= gift_budget[i]
    prob += gift_budget[i] <= max_spend[i] * invite[i]
for a, b in implications:
    prob += invite[a] <= invite[b]
for u, v in conflicts:
    prob += invite[u] + invite[v] <= 1
for rule in group_rules:
    prob += pulp.lpSum(invite[i] for i in rule["guests"]) >= rule["minCount"]
```
