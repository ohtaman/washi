## アプローチ

2段階の連続モデルで解きます。第1段階ではバイナリ割当 MIP により総評価額 $\sum_i v_{i,\sigma(i)}$ を最大化する部屋割り $\sigma$ を求め、第2段階ではその割り当てを固定したうえで非負の連続家賃 $p_r \ge 0$（合計 $R_{\text{total}}$）に関する LP を解き、無羨望性を満たしつつ最小余剰 $z$ を最大化します。

## 数理モデル

$$
\begin{aligned}
\text{Stage 1:} \quad \max_{x \in \{0,1\}^{n \times n}} \quad & \sum_{i=0}^{n-1} \sum_{r=0}^{n-1} v_{i,r} x_{i,r} \\
\text{s.t.} \quad & \sum_{r=0}^{n-1} x_{i,r} = 1 \quad \forall i, \qquad \sum_{i=0}^{n-1} x_{i,r} = 1 \quad \forall r \\[6pt]
\text{Stage 2:} \quad \max_{p \in \mathbb{R}_{\ge 0}^n,\, z \in \mathbb{R}} \quad & z \\
\text{s.t.} \quad & \sum_{r=0}^{n-1} p_r = R_{\text{total}}, \\
& v_{i,\sigma(i)} - p_{\sigma(i)} \ge z \quad \forall i, \\
& v_{i,\sigma(i)} - p_{\sigma(i)} \ge v_{i,r} - p_r \quad \forall i, r
\end{aligned}
$$

## ポイント

- **なぜ第1段階を先に解くのか**: LP 双対性（巡回単調性）により、符号制約のない実数家賃ベクトルに対して無羨望な家賃が存在するための必要十分条件は、$\sigma$ が総評価額 $\sum_i v_{i,\sigma(i)}$ を最大化することです（最適でない割り当てでは第2段階が無解になります）。本問のように非負制約 $p_r \ge 0$ と合計家賃固定 $\sum_r p_r = R_{\text{total}}$ がある場合でも総評価最大化は必要条件であり（突出して人気の部屋の評価差が $R_{\text{total}}$ を超えるような極端な例を除き）各テストケースでは非負の無羨望家賃が存在します。
- **無羨望性が均等余剰を制限する場合**: 平均余剰 $(V^* - R_{\text{total}}) / n$ は一定ですが、人気部屋への嫉妬を防ぐためにその部屋の家賃を高く設定せざるを得ず、最大最小余剰 $z^*$ が平均余剰を厳密に下回ることがあります。
- **最小余剰変数の下限**: 合計家賃が総評価額を上回り余剰が負になる場合にも対応できるよう、`minSurplus` は非負制約なし（WaSHI では `lb: -Infinity`、PuLP では `lowBound=None`）で宣言します。
- 関連用語: [ガイド＆用語集 — 問題ファミリー](?view=guide&lang=ja#paradigms) / [判定ステータス](?view=guide&lang=ja#verdicts)。

## 実装の勘所

第1段階の割当モデル `m1` を解いて部屋割り $\sigma$ を確定させた後、第2段階のモデル `m2` を新規に構築し、`rents` の下限を 0、`minSurplus` を符号制約なしの自由変数として定義します。

**WaSHI (TypeScript)**

```ts
// 第1段階: 割当 MIP
m1.constraint(x.map((row) => expr`${sum(row)} == 1`));
m1.constraint(Array.from({ length: n }, (_, r) => expr`${sum(x.map((row) => row[r]))} == 1`));
m1.objective(maximize(sum(x.flatMap((row, i) => row.map((v, r) => expr`${input.valuations[i][r]} * ${v}`)))));
await m1.solve();

// 第2段階: 無羨望・最小余剰最大化 LP
const rents = m2.continuous(n, { lb: 0, prefix: "rent" });
const minSurplus = m2.continuous("minSurplus", { lb: -Infinity, ub: Infinity });
m2.constraint(expr`${sum(rents)} == ${input.totalRent}`, "total_rent");
```

**PuLP (Python)**

```python
# 第1段階: 割当 MIP
for i in range(n):
    prob1 += pulp.lpSum(x[i]) == 1
for r in range(n):
    prob1 += pulp.lpSum(x[i][r] for i in range(n)) == 1
prob1 += pulp.lpSum(valuations[i][r] * x[i][r] for i in range(n) for r in range(n))
prob1.solve(pulp.HiGHS(msg=False))

# 第2段階: 無羨望・最小余剰最大化 LP
rents = [pulp.LpVariable(f"rent_{r}", lowBound=0) for r in range(n)]
min_surplus = pulp.LpVariable("min_surplus", lowBound=None)
prob2 += pulp.lpSum(rents) == total_rent
```
