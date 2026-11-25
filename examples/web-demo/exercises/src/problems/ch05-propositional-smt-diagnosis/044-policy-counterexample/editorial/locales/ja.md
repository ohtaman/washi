## アプローチ

すべてのポリシールールを満たしつつ安全不変条件を偽にする、真偽値フラグと有界整数属性の割当を探索します。真偽値フラグを `m.bool()`、整数属性を `{ lb, ub }` 付きの `m.integer()` で表し、`input.rules` の全ルールに加えて `not(safeInvariant)` を制約して `await m.check({ solver: "z3" })` を呼ぶと、抜け穴があれば `"Sat"` で具体的な反例が得られ、`"Unsat"` ならすべての状態で安全であることが証明されます。

## 数理モデル

$$
\begin{aligned}
\text{find} \quad & (b, z) \in \{\text{false}, \text{true}\}^{|\text{boolVars}|} \times \prod_{j \in \text{intVars}} \bigl([\text{lb}_j, \text{ub}_j] \cap \mathbb{Z}\bigr) \\
\text{s.t.} \quad & \bigwedge_{r \in \text{rules}} \phi_r(b, z) \;\land\; \neg\,\psi_{\text{safe}}(b, z)
\end{aligned}
$$

## ポイント

- **反駁による安全性証明**: `rules && safeInvariant` が `"Sat"` でも「安全な例が 1 つある」ことしか示せません。`not(safeInvariant)` を課して `"Unsat"` を確認して初めて「全状態で安全」と証明できます。
- **真偽値と整数不等式の直接的な混在**: Z3 では `implies` の条件側や `not` の内側に整数比較（`<=`, `>=`, `==`, `!=`）をそのまま記述でき、手動の Big-M 線形化は不要です。
- 用語の確認: [ガイド・用語集 — 解の状態](?view=guide&lang=ja#solver-status) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

すべてのポリシールールを `compileSmt` でモデルへ追加したうえで、`safeInvariant` の否定を `not(...)` で制約します。`m.check({ solver: "z3" })` が `"Sat"` でなければ反例は存在しません。

**WaSHI (TypeScript)**

```ts
input.rules.forEach((rule, i) => {
  m.constraint(compileSmt(rule, bools, ints), `rule_${i}`);
});
m.constraint(not(compileSmt(input.safeInvariant, bools, ints)), "negated_invariant");

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { hasViolation: false, counterexample: null };
```
