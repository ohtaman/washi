## アプローチ

基本制約 `baseRules` と先行ルール $R_0, \dots, R_{i-1}$ からなる累積論理式 $P_{<i}$ を維持し、各ルール $R_i = (c_i \implies e_i)$ を順に検査します。$P_{<i} \land c_i$ が `"Unsat"` なら **デッド**、そうでなく $P_{<i} \land c_i \land \neg e_i$ が `"Unsat"` なら **冗長** と判定し、$c_i \implies e_i$ を加えて $P_{<i+1}$ へ進みます。

## 数理モデル

$$
\begin{aligned}
P_{<i} &= \biggl(\bigwedge_{b \in \text{baseRules}} b\biggr) \;\land\; \biggl(\bigwedge_{j < i} (c_j \implies e_j)\biggr) \\
\text{Dead}(R_i) &\iff \text{Unsat}\bigl(P_{<i} \land c_i\bigr) \\
\text{Redundant}(R_i) &\iff \neg\text{Dead}(R_i) \;\land\; \text{Unsat}\bigl(P_{<i} \land c_i \land \neg e_i\bigr)
\end{aligned}
$$

## ポイント

- **デッドと冗長の排他分類**: $\neg(c_i \implies e_i) \equiv c_i \land \neg e_i$ のため、デッドなルール（$P_{<i} \land c_i$ が Unsat）は空真（vacuous truth）として $P_{<i} \land c_i \land \neg e_i$ も必ず Unsat になります。先にデッド判定を行うことで重複分類を防ぎます。
- **逐次蓄積による推移的検出**: 先行ルール $R_0, \dots, R_{i-1}$ を $P_{<i}$ として蓄積することで、前段ルールで発動条件が塞がれたルールや推移的に導かれる冗長ルールを正確に特定できます。
- 用語の確認: [ガイド・用語集 — 解の状態](?view=guide&lang=ja#solver-status)

## 実装の勘所

`PropFormula` の配列を新しい WaSHI の `Model` に変換して Z3 で判定する `isSat` ヘルパーを用意します。累積制約 `prior` を保持しながら各ルールを順に検査し、判定後は次のルールのために `{ implies: [r.condition, r.effect] }` を `prior` へ追加します。

**WaSHI (TypeScript)**

```ts
async function isSat(vars: string[], formulas: PropFormula[]): Promise<boolean> {
  const m = new Model("RuleAudit");
  const bools = m.bool(vars);
  formulas.forEach((f, i) => m.constraint(compileFormula(f, bools), `f_${i}`));
  return (await m.check({ solver: "z3" })).status === "Sat";
}

for (const r of input.rules) {
  if (!(await isSat(input.vars, [...prior, r.condition]))) {
    deadRules.push(r.id);
  } else if (!(await isSat(input.vars, [...prior, r.condition, { not: r.effect }]))) {
    redundantRules.push(r.id);
  }
  prior.push({ implies: [r.condition, r.effect] });
}
```
