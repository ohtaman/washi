## アプローチ

各カテゴリ $c$、属性値 $v \in V_c$、位置 $p \in \{0, \dots, n-1\}$ に対して、位置 $p$ のカテゴリ $c$ に値 $v$ を割り当てるかを表す Boolean 決定変数 $x_{c,v,p} \in \{\text{false}, \text{true}\}$ を導入します。すべての（位置, カテゴリ）組および（カテゴリ, 値）組にちょうど 1 つ（exact-one）制約を課し、各構造化ヒントを命題論理制約として表します。WaSHI では `m.bool()` で変数を宣言し、`or(...)` とペアごとの `not(and(...))` で exact-one 制約を記述したうえで、`await m.check({ solver: "z3" })` で充足可能性を判定します。

## 数理モデル

$$
\begin{aligned}
\text{find} \quad & x_{c,v,p} \in \{\text{false}, \text{true}\} && \forall c \in C,\; v \in V_c,\; p \in \{0, \dots, n-1\} \\
\text{s.t.} \quad & \bigvee_{v \in V_c} x_{c,v,p} \;\land\; \bigwedge_{u \neq v} \neg(x_{c,u,p} \land x_{c,v,p}) && \forall c \in C,\; p \in \{0, \dots, n-1\} \\
& \bigvee_{p=0}^{n-1} x_{c,v,p} \;\land\; \bigwedge_{p < q} \neg(x_{c,v,p} \land x_{c,v,q}) && \forall c \in C,\; v \in V_c \\
& \phi_{\text{clue}}(x) = \text{true} && \forall \text{clue} \in \text{clues}
\end{aligned}
$$

## ポイント

- **純粋な Boolean による exact-one 定式化**: 少なくとも 1 つを `or(...)`、高々 1 つをペアごとの `not(and(...))` で表現することで、整数演算を混ぜずに純粋な SAT としてモデル化できます。
- **位置・隣接ヒントの変換**: 直接左隣（`immediate: true` の `leftOf`）は $x_{c_1,v_1,p} \implies x_{c_2,v_2,p+1}$ と末尾禁止で表し、一般的な `leftOf` や `nextTo` は各位置 $p$ から許される対象位置の論理和への含意として表します。
- 関連定義: [ガイド & 用語集 — 問題ファミリー](?view=guide&lang=ja#paradigms) / [ソルバーステータス](?view=guide&lang=ja#solver-status)

## 実装の勘所

`exactOne` ヘルパーで `or(...)` による「少なくとも1つ」と `.forEach()` によるペアごとの「高々1つ」を登録し、最後に `m.check({ solver: "z3" })` が `"Sat"` でなければ充足不能を返します。

**WaSHI (TypeScript)**

```ts
function exactOne(m: Model, vars: BoolVar[], prefix: string): void {
  m.constraint(or(...vars), `${prefix}_at_least_one`);
  vars.forEach((vi, i) => {
    vars.slice(i + 1).forEach((vj, offset) => {
      m.constraint(not(and(vi, vj)), `${prefix}_at_most_one_${i}_${i + 1 + offset}`);
    });
  });
}

const res = await m.check({ solver: "z3" });
if (res.status !== "Sat") return { satisfiable: false, assignment: null };
```
