## アプローチ

まず全ルールにルール ID 名を付けて `await m.check({ solver: "z3" })` を呼び、得られた `res.unsatCore` を初期候補とします。次に候補内の各ルールを 1 つずつ除いた部分集合を再検査し、`"Unsat"` のままであればそのルールを削る削除縮約（deletion-based contraction）で極小矛盾集合（MUS）を確定します。

## 数理モデル

$$
\begin{aligned}
C \subseteq R \text{ is a MUS} \iff & \text{Unsat}(C) \;\land\; \forall r \in C,\; \text{Sat}(C \setminus \{r\})
\end{aligned}
$$

## ポイント

- **生の `unsatCore` が非極小になりうる理由**: Z3 の仮定追跡コアは無関係な制約を素早く除外できますが、重複する含意や迂回路があると余剰制約を残す場合があります。削除縮約を行って初めて極小性（irreducibility）が保証されます。
- **充足可能性の単調性**: ある時点で $C \setminus \{r\}$ が `"Sat"` であれば、その後に集合が縮小しても $C' \setminus \{r\}$ は必ず `"Sat"` になるため、候補を 1 周走査するだけで十分です。
- 用語の確認: [ガイド・用語集 — 解の状態](?view=guide&lang=ja#solver-status) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const initial = await checkSubset(input, allIds);
let core = Array.from(new Set(initial.unsatCore ?? allIds));

for (const ruleId of [...core]) {
  if (!core.includes(ruleId)) continue;
  const candidate = core.filter((id) => id !== ruleId);
  const res = await checkSubset(input, candidate);
  if (res.status === "Unsat") {
    core = res.unsatCore?.length ? candidate.filter((id) => new Set(res.unsatCore).has(id)) : candidate;
  }
}
```
