## アプローチ

各パッケージ・バージョンの組 $(p, v)$ に対して、導入有無を表す Boolean 選択変数 $x_{p,v} \in \{\text{false}, \text{true}\}$ と、$x_{p,v} \iff (u_{p,v} = 1)$ で連動する 0-1 計数変数 $u_{p,v} \in \{0, 1\}$ を導入します。パッケージごとの高々 1 つ選択、必須ルートのちょうど 1 つ選択、`requires` の含意、`conflicts` の排他を論理制約として課したうえで $\sum_{p,v} u_{p,v}$ を最小化します。WaSHI ではそれぞれ `pick[p][v]`（`m.bool`）と `used[p][v]`（`m.binary`）で宣言し、`await m.solve({ solver: "z3" })` で解きます。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{p, v} u_{p,v} \\
\text{s.t.} \quad & \neg(x_{p,v_i} \land x_{p,v_j}) && \forall p, \; i < j \\
& \bigvee_{v \in V_r} x_{r,v} && \forall r \in \text{roots} \\
& x_{p,v} \implies \bigvee_{d \in D} x_{q,d} && \forall (p@v \to q@D) \in \text{requires} \\
& \neg(x_{p_1,v_1} \land x_{p_2,v_2}) && \forall ((p_1,v_1), (p_2,v_2)) \in \text{conflicts} \\
& x_{p,v} \iff (u_{p,v} = 1) && \forall p, \; v \in V_p \\
& x_{p,v} \in \{\text{false}, \text{true}\}, \; u_{p,v} \in \{0, 1\} && \forall p, \; v \in V_p
\end{aligned}
$$

## ポイント

- **高々 1 つ（At-Most-One）とちょうど 1 つ（Exact-One）**: 同一パッケージ内の全ペアに対する `not(and(a, b))` で重複導入を禁じ、必須ルートにのみ `or(...versions)` を加えることでちょうど 1 つのバージョン選択を強制できます。
- **`BoolVar` と `m.binary` の双方向チャネリング**: 論理結合子は `BoolVar` 上で動作する一方、`minimize(sum(...))` は算術変数 `Var` を足し合わせるため、各 `m.bool(...)` と `m.binary(...)` を双方向の `implies`（``implies(b, expr`${u} == 1`)`` と ``implies(not(b), expr`${u} == 0`)``）で連結します。
- **充足不能な依存グラフの検知**: 依存関係や競合の組み合わせにより実行可能な構成が存在しない場合、`m.solve({ solver: "z3" })` は `"Infeasible"` を返すため、そのまま `{ feasible: false, selected: null, installedCount: null }` を返します。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

各命題変数 `b` と 0-1 計数変数 `u` を双方向の `implies` で連結し、必須ルートと依存ルール（`depVersions` が空なら `pkg@ver` を禁止）を論理制約として登録したうえで、`minimize(sum(allUsed))` と `m.solve({ solver: "z3" })` で最適解を求めます。

**WaSHI (TypeScript)**

```ts
const b = m.bool(`pick_${pkg}_${ver}`);
const u = m.binary(`used_${pkg}_${ver}`);
m.constraint(implies(b, expr`${u} == 1`), `link_on_${pkg}_${ver}`);
m.constraint(implies(not(b), expr`${u} == 0`), `link_off_${pkg}_${ver}`);

for (const root of input.roots) {
  const vars = input.packages[root].map((v) => pick[root][v]);
  m.constraint(vars.length === 1 ? vars[0] : or(...vars), `root_${root}`);
}
input.requires.forEach((req, idx) => {
  const deps = req.depVersions.map((dv) => pick[req.depPkg][dv]);
  const rhs = deps.length === 0 ? not(pick[req.pkg][req.ver]) : deps.length === 1 ? deps[0] : or(...deps);
  m.constraint(deps.length === 0 ? rhs : implies(pick[req.pkg][req.ver], rhs), `req_${idx}`);
});
m.objective(minimize(sum(allUsed)));
const status = await m.solve({ solver: "z3" });
```
