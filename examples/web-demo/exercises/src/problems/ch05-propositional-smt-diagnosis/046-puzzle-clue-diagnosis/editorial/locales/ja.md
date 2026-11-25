## アプローチ

各マス $c$ を地雷か安全かを表す 0-1 変数 $x_c \in \{0, 1\}$ でモデル化し、ヒント集合 $R$ の各ヒントを名前付き制約として記述します。目標は、全体として充足不能でありながらどの 1 つを除いても充足可能になる極小矛盾部分集合（MUS）$C \subseteq R$ を求めることです。まず全ヒントに対して `await m.check({ solver: "z3" })` を実行して `res.unsatCore` を初期候補とし、各ヒント ID を 1 つずつ除いても `"Unsat"` のままなら削除する削除縮小法で極小コアを抽出します。

## 数理モデル

$$
\begin{aligned}
& x \in \{0, 1\}^{|\text{cells}|}, \quad R = \text{clues} \\
C \subseteq R \text{ が MUS} &\iff \text{Unsat}(C) \;\land\; \forall r \in C,\; \text{Sat}(C \setminus \{r\})
\end{aligned}
$$

## ポイント

- **生の `unsatCore` が極小とは限らない理由**: 名前付き制約から WaSHI が収集する SMT コアは高速に無関係な制約を除けますが、重複した矛盾では冗長な制約を残すことがあるため、削除縮小法で極小性を保証します。
- **充足可能性の単調性**: 一度 $C \setminus \{r\}$ が `"Sat"` であると確認されれば、その後の縮小で得られるより小さい部分集合 $C' \setminus \{r\}$ も常に `"Sat"` となるため、候補リストを 1 周走査するだけで十分です。
- 用語の確認: [ガイド・用語集 — 解の状態](?view=guide&lang=ja#solver-status) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

`m.binary(input.cells)` で 0-1 変数を宣言し、有効なヒントだけを `clue.id` の制約名で登録して Z3 で判定する `checkSubset` ヘルパーを用意します。最初の `unsatCore` を候補集合 `core` として取り出し、各ヒント ID を 1 つずつ除いた部分集合が `"Unsat"` のままなら削除して縮小します。

**WaSHI (TypeScript)**

```ts
async function checkSubset(input: P046Input, activeIds: string[]): Promise<CheckResult> {
  const m = new Model("PuzzleClueDiagnosis");
  const x = m.binary(input.cells);
  const active = new Set(activeIds);
  for (const clue of input.clues) {
    if (active.has(clue.id)) addClueConstraint(m, clue, x); // m.constraint(..., clue.id)
  }
  return m.check({ solver: "z3" });
}

const initial = await checkSubset(input, allIds);
let core = Array.from(new Set(initial.unsatCore ?? allIds));

for (const clueId of [...core]) {
  if (!core.includes(clueId)) continue;
  const candidate = core.filter((id) => id !== clueId);
  const res = await checkSubset(input, candidate);
  if (res.status === "Unsat") {
    const nextCore = res.unsatCore?.length ? new Set(res.unsatCore) : null;
    core = nextCore ? candidate.filter((id) => nextCore.has(id)) : candidate;
  }
}
```
