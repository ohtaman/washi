## アプローチ

すべての名前付きヒントに対して `await m.check({ solver: "z3" })` を実行して初期の充足不能コア `res.unsatCore` を取得し、候補コア内の各ヒント ID を順に取り除いて残りが `"Unsat"` のままかを確認します。不要なヒントを削除し続けることで、極小充足不能部分集合（MUS）が得られます。

## 数理モデル

$$
\begin{aligned}
C \subseteq R \text{ is a MUS} \iff & \text{Unsat}(C) \;\land\; \forall r \in C,\; \text{Sat}(C \setminus \{r\})
\end{aligned}
$$

## ポイント

- **生の `unsatCore` が極小とは限らない理由**: SMT ソルバーの assumption tracking によるコア抽出は高速に無関係な制約を除けますが、重複した矛盾では冗長な制約を残すことがあるため、削除縮小法で極小性を保証します。
- **充足可能性の単調性**: 一度 $C \setminus \{r\}$ が `"Sat"` であると確認されれば、その後の縮小で得られるより小さい部分集合 $C' \setminus \{r\}$ も常に `"Sat"` となるため、候補リストを1周走査するだけで十分です。
- 関連定義: [ガイド & 用語集 — ソルバーステータス](?view=guide&lang=ja#solver-status) / [問題ファミリー](?view=guide&lang=ja#paradigms)

## 実装のポイント

最初の `unsatCore` を候補集合 `core` として取り出し、各ヒント ID を 1 つずつ除いた部分集合で `checkSubset` を再実行して、`"Unsat"` のままならそのヒントを削除して縮小します。

**WaSHI (TypeScript)**

```ts
const initial = await checkSubset(input, allIds);
let core = Array.from(new Set(initial.unsatCore ?? allIds));

for (const clueId of [...core]) {
  if (!core.includes(clueId)) continue;
  const candidate = core.filter((id) => id !== clueId);
  const res = await checkSubset(input, candidate);
  if (res.status === "Unsat") {
    core = res.unsatCore?.length ? candidate.filter((id) => new Set(res.unsatCore).has(id)) : candidate;
  }
}
```
