## アプローチ

基本制約 `baseRules` から始めた累積ルール集合 $P$ に対し、各ルール $R_i = (c_i \implies e_i)$ を順に検査します。$P \land c_i$ が `"Unsat"` なら **デッド**、そうでなく $P \land c_i \land \neg e_i$ が `"Unsat"` なら **冗長** と判定し、$c_i \implies e_i$ を $P$ に追加して次へ進みます。

## 数理モデル

$$
\begin{aligned}
\text{Dead}(R_i) &\iff \text{Unsat}\bigl(P_{<i} \land c_i\bigr) \\
\text{Redundant}(R_i) &\iff \neg\text{Dead}(R_i) \;\land\; \text{Unsat}\bigl(P_{<i} \land c_i \land \neg e_i\bigr)
\end{aligned}
$$

## ポイント

- **デッドと冗長の排他分類**: $\neg(c_i \implies e_i) \equiv c_i \land \neg e_i$ のため、デッドなルールは空真（vacuous truth）として $P \land c_i \land \neg e_i$ も必ず Unsat になります。先にデッド判定を行うことで重複分類を防ぎます。
- **逐次蓄積による推移的検出**: 先行ルール $R_0, \dots, R_{i-1}$ を蓄積することで、前段ルールでトリガーが塞がれたルールや推移的に導かれる冗長ルールを正確に特定できます。
- 用語の確認: [ガイド・用語集 — 解の状態](?view=guide&lang=ja#solver-status)

## 実装の勘所

累積制約 `prior` を保持しながら各ルールを順に検査し、条件部の充足可能性でデッド判定、否定した帰結との同時充足可能性で冗長判定を行います。判定後は次のルールのために `implies` 形式で `prior` へ追加します。

**WaSHI (TypeScript)**

```ts
for (const r of input.rules) {
  if (!(await isSat(input.vars, [...prior, r.condition]))) {
    deadRules.push(r.id);
  } else if (!(await isSat(input.vars, [...prior, r.condition, { not: r.effect }]))) {
    redundantRules.push(r.id);
  }
  prior.push({ implies: [r.condition, r.effect] });
}
```
