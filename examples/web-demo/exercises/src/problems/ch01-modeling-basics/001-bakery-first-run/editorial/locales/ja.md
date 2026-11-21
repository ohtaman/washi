## アプローチ

クロワッサン生産量 `c` と食パン生産量 `l` を 0 以上の **連続決定変数** として宣言し、小麦粉・バターの 2 本の `<=` 制約のもとで利益の線形和を最大化します。

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

- **初期コードが `VIOLATION` になる理由**: バター制約がないと、小麦粉あたり利益が高い食パンだけに全振りされ（$c=0, \ell=40$）、バター使用量 `80` が上限 `70` を超えてしまいます。
- **LP（線形計画）の基本**: 変数が連続値（`continuous`）で、制約・目的関数がすべて 1 次式のモデルは **LP** と呼ばれます。最適解は必ず 2 本の制約線が交わる「角（頂点）」のどれかに現れます。
- 用語の確認: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${c} + 2 * ${l} <= ${input.butterCap}`, "butter");
```

**PuLP (Python)**

```python
prob += c + 2 * l <= butterCap, "butter"
```
