## アプローチ

各フラグ名に対して命題論理変数 `m.bool(name)` を宣言し、各ルールを WaSHI の論理演算子（`not`, `and`, `or`, `implies`, `xor`）へ再帰的に変換して登録したうえで、`await m.check({ solver: "z3" })` で充足可能性を判定します。

## 数理モデル

$$
\begin{aligned}
\text{find} \quad & x_v \in \{\text{false}, \text{true}\} && \forall v \in V \\
\text{s.t.} \quad & \phi_r(x) = \text{true} && \forall r \in \text{rules}
\end{aligned}
$$

## ポイント

- **`m.bool()` と `m.binary()` の使い分け**: `BoolVar` は `0`-`1` の数値変数ではなく真偽値そのものを表す命題変数であり、`implies()` や `xor()` などの論理結合子にそのまま渡せます。
- **`m.check()` による充足判定**: 目的関数がない論理充足問題では `m.solve()` ではなく `m.check({ solver: "z3" })` を呼び、`"Sat"` / `"Unsat"` で結果を分岐します。
- 用語の確認: [ガイド・用語集 — 問題クラス](?view=guide&lang=ja#paradigms) / [解の状態](?view=guide&lang=ja#solver-status)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const m = new Model("PropositionalSAT");
const bools = m.bool(input.vars);

input.rules.forEach((rule, i) => {
  m.constraint(compileFormula(rule, bools), `rule_${i}`);
});

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { satisfiable: false, assignment: null };
```
