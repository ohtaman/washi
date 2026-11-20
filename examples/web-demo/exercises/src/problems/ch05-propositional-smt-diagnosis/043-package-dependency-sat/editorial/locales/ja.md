## アプローチ

各 `(pkg, ver)` ペアに命題変数 `pick[p][v]`（`m.bool`）と 0-1 計数変数 `used[p][v]`（`m.binary`）を用意し、パッケージごとの高々1つ選択・必須ルートのちょうど1つ選択・`requires` 含意・`conflicts` 排他を論理制約として記述したうえで、`await m.solve({ solver: "z3" })` で導入パッケージ総数を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{p, v} u_{p,v} \\
\text{s.t.} \quad & \neg(x_{p,v_i} \land x_{p,v_j}) && \forall p, \; i < j \\
& \bigvee_{v \in V_r} x_{r,v} && \forall r \in \text{roots} \\
& x_{p,v} \implies \bigvee_{d \in D} x_{q,d} && \forall (p@v \to q@D) \in \text{requires} \\
& \neg(x_{p_1,v_1} \land x_{p_2,v_2}) && \forall ((p_1,v_1), (p_2,v_2)) \in \text{conflicts} \\
& x_{p,v} \iff (u_{p,v} = 1) && u_{p,v} \in \{0, 1\}
\end{aligned}
$$

## ポイント

- **高々 1 つ（At-Most-One）とちょうど 1 つ（Exact-One）**: 同一パッケージ内の全ペアに対する `not(and(a, b))` で重複導入を禁じ、必須ルートにのみ `or(...versions)` を加えることでちょうど 1 つのバージョン選択を強制できます。
- **充足不能な依存競合の検知**: ダイヤモンド依存などで解が存在しない場合、`m.solve({ solver: "z3" })` は `"Infeasible"` を返すため、正直に `{ feasible: false, selected: null, installedCount: null }` を返します。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (const root of input.roots) {
  const vars = input.packages[root].map((v) => pick[root][v]);
  m.constraint(vars.length === 1 ? vars[0] : or(...vars), `root_${root}`);
}
input.requires.forEach((req, idx) => {
  const deps = req.depVersions.map((dv) => pick[req.depPkg][dv]);
  m.constraint(implies(pick[req.pkg][req.ver], deps.length === 1 ? deps[0] : or(...deps)), `req_${idx}`);
});
m.objective(minimize(sum(allUsed)));
const status = await m.solve({ solver: "z3" });
```
