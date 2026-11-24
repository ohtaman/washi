## アプローチ

最初に `await m.check({ solver: "z3" })` で充足解 $x^*$ を求め、見つかった場合は $x^*$ とまったく同じ真理値割当だけを禁止する No-Good カットを追加して再度 `m.check({ solver: "z3" })` を実行します。2 回目が `"Unsat"` であれば解は唯一です。

## 数理モデル

$$
\begin{aligned}
\text{1回目:} \quad & \bigwedge_{r \in \text{rules}} \phi_r(x) \\
\text{No-Good カット:} \quad & \bigvee_{i : x^*_i = \text{true}} \neg x_i \;\lor\; \bigvee_{i : x^*_i = \text{false}} x_i
\end{aligned}
$$

## ポイント

- **ド・モルガンの法則による禁止節**: 「少なくとも 1 つの変数が $x^*$ と異なる」という条件 $\neg\bigl(\bigwedge_i (x_i = x^*_i)\bigr)$ は、`true` だった変数を `not(v)`、`false` だった変数を `v` として `or(...)` で結ぶ 1 本の論理和になります（例題の `{ a: true, b: true, c: false, d: true }` なら `or(not(a), not(b), c, not(d))` です）。
- **反駁による一意性証明**: 2 回目の `m.check()` が `"Unsat"` になること自体が「他に解が存在しない」という厳密な数学的証明です。
- 用語の確認: [ガイド・用語集 — 解の状態](?view=guide&lang=ja#solver-status)

## 実装の勘所

最初の `m.check({ solver: "z3" })` で得た割り当てを `Object.fromEntries` で取り出し、その割り当てだけを否定する `nogood_cut` 制約を追加して再度 `m.check` を呼び出します。2 回目が `"Unsat"` であれば解は一意です。

**WaSHI (TypeScript)**

```ts
const first = await m.check({ solver: "z3" });
if (first.status !== "Sat") return { satisfiable: false, assignment: null, unique: false };

const assignment = Object.fromEntries(input.vars.map((v) => [v, Boolean(bools[v].value)]));
m.constraint(
  or(...input.vars.map((v) => (assignment[v] ? not(bools[v]) : bools[v]))),
  "nogood_cut"
);
const second = await m.check({ solver: "z3" });
return { satisfiable: true, assignment, unique: second.status === "Unsat" };
```
