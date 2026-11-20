## アプローチ

真偽値属性を `m.bool()`、整数属性を `{ lb, ub }` 付き `m.integer()` として宣言し、すべてのポリシールールに加えて安全不変条件の否定 `not(safeInvariant)` を制約します。`await m.check({ solver: "z3" })` が `"Sat"` なら具体的な抜け穴（反例）、`"Unsat"` なら安全性証明となります。

## 数理モデル

$$
\begin{aligned}
\text{find} \quad & (b, z) \in \{\text{false}, \text{true}\}^{|B|} \times \prod_j [\text{lb}_j, \text{ub}_j] \\
\text{s.t.} \quad & \bigwedge_{r \in \text{rules}} \phi_r(b, z) \;\land\; \neg\,\psi_{\text{safe}}(b, z)
\end{aligned}
$$

## ポイント

- **反駁による安全性証明**: `rules && safeInvariant` が `"Sat"` でも「安全な例が 1 つある」ことしか示せません。`not(safeInvariant)` を課して `"Unsat"` を確認して初めて「全状態で安全」と証明できます。
- **真偽値と整数不等式のシームレスな結合**: Z3 では `implies` の条件側や `not` の内側に整数比較（`<=`, `>=`, `==`, `!=`）をそのまま混在させられます。
- 用語の確認: [ガイド・用語集 — 解の状態](?view=guide&lang=ja#solver-status) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
input.rules.forEach((rule, i) => {
  m.constraint(compileSmt(rule, bools, ints), `rule_${i}`);
});
m.constraint(not(compileSmt(input.safeInvariant, bools, ints)), "negated_invariant");

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { hasViolation: false, counterexample: null };
```
