## アプローチ

オーツ麦の配合量を $x$、大豆の配合量を $y$ として 0 以上の**連続決定変数**を定義し、たんぱく質と食物繊維の必要量の下限制約（`>=`）のもとで、総コストを**最小化（`minimize`）**します。

## 数理モデル

$$
\begin{aligned}
\min \quad & 30x + 50y \\
\text{s.t.} \quad & 2x + y \ge \text{minProtein} \\
& x + 3y \ge \text{minFiber} \\
& x, y \ge 0
\end{aligned}
$$

## ポイント

- **上限制約と下限制約**: **#001** では、利益を無限に増やそうとする `maximize` を上限制約（`<=`）が上から抑え込んでいました。一方、今回の問題では、コストを 0 まで下げようとする `minimize` を 2 つの下限制約（`>=`）が下から支える役割を果たします。
- **単品より配合が安くなる理由**: たんぱく質 1 単位あたりのコストはオーツ麦（15）、食物繊維 1 単位あたりのコストは大豆（約 16.7）のほうがそれぞれ割安です。そのため、入出力例（`minProtein = 8, minFiber = 9`）ではどちらか一方だけで必要量を満たそうとするよりも、両者のバランスを取って $3:2$ で配合するほうが総コストを抑えられます（最適な配合比は目標下限によって変わります）。
- 用語の確認: [ガイド・用語集 — 制約と目的関数](?view=guide&lang=ja#building-blocks)

## 実装の勘所

目的関数を最小化（`minimize` / `pulp.LpMinimize`）に設定したうえで、各栄養素の下限制約を `>=` で追加します。目的の向き（最大化か最小化か）と制約不等号の向き（`<=` か `>=` か）をセットで確認するのがポイントです。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`2 * ${oats} + ${beans} >= ${input.minProtein}`, "protein");
m.constraint(expr`${oats} + 3 * ${beans} >= ${input.minFiber}`, "fiber");
```

**PuLP (Python)**

```python
prob += 2 * oats + beans >= min_protein
prob += oats + 3 * beans >= min_fiber
```
