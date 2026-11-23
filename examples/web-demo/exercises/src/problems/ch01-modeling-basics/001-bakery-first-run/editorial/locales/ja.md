## アプローチ

クロワッサンの生産量 `c` と食パンの生産量 `l` を 0 以上の**連続決定変数**として定義し、小麦粉とバターの**上限制約（`<=`）**のもとで、総利益（利益の線形和）を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & 40c + 70\ell \\
\text{s.t.} \quad & 2c + 3\ell \le \text{flourCap} \\
& c + 2\ell \le \text{butterCap} \\
& c, \ell \ge 0
\end{aligned}
$$

## ポイント

- **初期コードが `VIOLATION` になる理由**: 初期コードにはバターの在庫制約が含まれていないため、バターの在庫上限を超えた生産量が求められてしまい、`VIOLATION` になります。
- **LP（線形計画）**: 変数が連続値（`continuous`）で、制約・目的関数がすべて 1 次式のモデルは **LP** と呼ばれます。
- 用語の確認: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

制約式はテンプレートリテラル `expr`（WaSHI）や `prob += ...`（PuLP）で直感的に記述できます。第 2 引数で `"butter"` のように制約名を付けておくと、後でモデルの診断や検算をするときにどの制約か追いやすくなります。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${c} + 2 * ${l} <= ${input.butterCap}`, "butter");
```

**PuLP (Python)**

```python
prob += c + 2 * l <= butter_cap, "butter"
```
