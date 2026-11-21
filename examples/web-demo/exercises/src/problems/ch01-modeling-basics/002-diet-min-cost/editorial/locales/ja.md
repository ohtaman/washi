## アプローチ

オーツ麦と豆類の配合量を 0 以上の連続決定変数とおき、たんぱく質・食物繊維の下限を満たす 2 本の `>=` 制約のもとで総コストを **最小化（`minimize`）** します。

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

- **`<=` と `>=` の役割の違い**: **#001** では `maximize` を上限制約（`<=`）が抑えていましたが、ここでは `minimize` が値を `0` に下げようとするのを 2 本の下限制約（`>=`）が支えます。
- **単品より配合が安くなる理由**: たんぱく質はオーツ麦（単価 15/たんぱく質）、食物繊維は豆類（単価 16.7/繊維）が得意なので、片方だけ買う（270 や 400）より 2 つを組み合わせる角 $(3, 2)$ の `190` が最安になります。
- 用語の確認: [ガイド・用語集 — 制約と目的関数](?view=guide&lang=ja#building-blocks)

## 実装の勘所

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
