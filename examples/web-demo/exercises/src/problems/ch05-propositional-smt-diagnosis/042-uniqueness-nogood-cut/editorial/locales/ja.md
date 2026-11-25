## アプローチ

各変数 $i \in \text{vars}$ に Boolean 変数 $x_i \in \{\text{false}, \text{true}\}$ を導入し、2 段階の充足可能性判定を行います。まず全ルールの論理積を満たす真理値割当 $x^*$ を 1 つ求め、見つかった場合は $x^*$ とまったく同じ割当だけを禁止する禁止節（No-Good カット）を追加して再度充足可能性を判定します。2 段階目が充足不能であれば解は唯一です。WaSHI では各段階を `await m.check({ solver: "z3" })` で実行し、2 回目が `"Unsat"` かどうかで一意性を判定します。

## 数理モデル

$$
\begin{aligned}
\text{変数:} \quad & x_i \in \{\text{false}, \text{true}\} && \forall i \in \text{vars} \\
\text{1回目:} \quad & \bigwedge_{r \in \text{rules}} \phi_r(x) \\
\text{No-Good カット:} \quad & \psi_{\text{cut}}(x) \equiv \bigvee_{i : x^*_i = \text{true}} \neg x_i \;\lor\; \bigvee_{i : x^*_i = \text{false}} x_i \\
\text{2回目:} \quad & \biggl(\bigwedge_{r \in \text{rules}} \phi_r(x)\biggr) \land \psi_{\text{cut}}(x)
\end{aligned}
$$

## ポイント

- **ド・モルガンの法則による禁止節**: 「少なくとも 1 つの変数が $x^*$ と異なる」という条件 $\neg\bigl(\bigwedge_i (x_i = x^*_i)\bigr)$ は、`true` だった変数を `not(v)`、`false` だった変数を `v` として `or(...)` で結ぶ 1 本の論理和になります（例題の `{ a: true, b: true, c: false, d: true }` なら `or(not(a), not(b), c, not(d))` です）。
- **反駁による一意性証明**: 2 回目の `m.check()` が `"Unsat"` になること自体が「他に解が存在しない」という厳密な数学的証明です。
- 用語の確認: [ガイド・用語集 — 解の状態](?view=guide&lang=ja#solver-status)

## 実装の勘所

最初の `m.check({ solver: "z3" })` で得た割当を `Object.fromEntries` で取り出し、その割当だけを否定する `nogood_cut` 制約を追加して再度 `m.check` を呼び出します。2 回目が `"Unsat"` であれば解は一意です。

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
