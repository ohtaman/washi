## アプローチ

Charnes-Cooper 変換として $t = 1 / (d^\top x + d_0) > 0$ および $y = t x \ge 0$ を導入します。有界領域上で $d_0 > 0, d \ge 0$ より $t$ は必ず厳密に正となるため、分母を $1$ に正規化した単一の LP を解いたあと $x = y / t$ で元の変数へ復元できます。

## 数理モデル

$$
\begin{aligned}
\max \quad & c^\top y + c_0 t \\
\text{s.t.} \quad & d^\top y + d_0 t = 1 \\
& A y \le b t \\
& 0 \le y_j \le u_j t && \forall j \in \{0, \dots, n-1\} \\
& t \ge 0
\end{aligned}
$$

## ポイント

- **右辺定数への $t$ の掛け忘れに注意**: $y = t x$ を代入すると、資源制約 $a_k^\top x \le b_k$ は $a_k^\top y \le b_k t$ に、変数の上界 $x_j \le u_j$ は $y_j \le u_j t$ になります。$b_k$ や $u_j$ に $t$ を掛け忘れるとスケールが破綻するため注意してください。
- **分子だけ最大化してはいけない理由**: 分母も $x$ に依存して大きくなるため、資源上限までフル稼働する解より、分母を小さく抑える組み合わせの方が高い効率比を達成することがよくあります。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

分母を 1 に正規化する制約 `cc_norm` を置き、資源制約および変数上界の右辺にもスカラー変数 `t` を掛けて登録したうえで、スケール済み目的関数を最大化します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  expr`dot(${input.denCoeffs}, ${y}) + ${input.denConst} * ${t} == 1`,
  "cc_norm"
);
m.constraint(
  input.capacities.map((cap, k) => expr`dot(${input.usages[k]}, ${y}) <= ${cap} * ${t}`)
);
m.constraint(input.upperBounds.map((ub, j) => expr`${y[j]} <= ${ub} * ${t}`));
m.objective(maximize(expr`dot(${input.numCoeffs}, ${y}) + ${input.numConst} * ${t}`));
```

**PuLP (Python)**

```python
prob += pulp.lpDot(den_c, y) + den_0 * t == 1
for k, cap in enumerate(caps):
    prob += pulp.lpDot(usages[k], y) <= cap * t
for j, ub in enumerate(ubs):
    prob += y[j] <= ub * t
prob += pulp.lpDot(num_c, y) + num_0 * t
```
