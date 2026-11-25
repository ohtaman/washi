## アプローチ

真偽値変数 `m.bool(input.vars)` に対してすべての `hardRules` を厳密制約として課し、重み $w_k$ の各ソフトルール $S_k$ には 0-1 の緩和フラグ変数 `violated[k]`（`m.binary`）を用意して $S_k \lor (v_k = 1)$ を追加します。`await m.solve({ solver: "z3" })` で $\sum_k w_k v_k$ を最小化することで重み付き MaxSAT を解きます。

## 数理モデル

ソフトルールの本数を $m = |\text{softRules}|$ とします。

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{m-1} w_k v_k \\
\text{s.t.} \quad & H_j(x) = \text{true} && \forall j \\
& S_k(x) \lor (v_k = 1) && \forall k \in \{0, \dots, m-1\} \\
& S_k(x) \implies (v_k = 0) && \forall k \in \{0, \dots, m-1\} \\
& x_i \in \{\text{false}, \text{true}\}, \quad v_k \in \{0, 1\}
\end{aligned}
$$

## ポイント

- **選言によるソフトルール緩和**: $S_k \lor (v_k = 1)$ により、$v_k = 0$ のときは $S_k$ が強制され、$v_k = 1$ とすればコスト $w_k$ を払って $S_k$ を緩和できます。
- **フラグと違反の一致保証**: 逆向きの $S_k \implies (v_k = 0)$ も加えておくと、重みが 0 のルールがあっても `violated[k]` と実際の違反状態が常に一致します。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [モデルの基本構成要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

各ソフトルールに緩和フラグ `violated[k]` を割り当て、`or(cond, ...)` で違反時の緩和を、`implies(cond, ...)` で充足時のフラグ 0 を強制します。最後に `dot(weights, violated)` を `minimize` で最小化します。

**WaSHI (TypeScript)**

```ts
const violated = m.binary(input.softRules.length, { prefix: "viol" });
const weights = input.softRules.map((s) => s.weight);

input.softRules.forEach((s, k) => {
  const cond = compileFormula(s.expr, bools);
  m.constraint(or(cond, expr`${violated[k]} == 1`), `soft_${s.id}`);
  m.constraint(implies(cond, expr`${violated[k]} == 0`), `tight_${s.id}`);
});
m.objective(minimize(dot(weights, violated)));
await m.solve({ solver: "z3" });
```
