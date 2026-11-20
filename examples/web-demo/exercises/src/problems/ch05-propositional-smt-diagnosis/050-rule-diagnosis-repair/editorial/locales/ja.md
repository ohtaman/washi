## アプローチ

3 段階の SMT パイプラインを Z3 で実行します。(1) `hardRules` と `softRules` 全体の整合性を `m.check({ solver: "z3" })` で判定し、`"Sat"` なら修復不要で返します。(2) `"Unsat"` なら `res.unsatCore` を起点に削除縮約で極小矛盾コア（MUS）を特定します。(3) ソフトルール緩和変数 `violated[k]` を導入して `m.solve({ solver: "z3" })` で最小コスト修復解を合成します。

## 数理モデル

$$
\begin{aligned}
\text{Stage 1:} \quad & \text{Check } \Bigl(\bigwedge_j H_j\Bigr) \land \Bigl(\bigwedge_k S_k\Bigr) \\
\text{Stage 2 (MUS):} \quad & C \subseteq H \cup S,\quad \text{Unsat}(C) \;\land\; \forall r \in C,\, \text{Sat}(C \setminus \{r\}) \\
\text{Stage 3 (Repair):} \quad & \min \sum_{k} w_k v_k \quad \text{s.t.} \quad H_j,\; S_k \lor (v_k = 1),\; v_k \in \{0, 1\}
\end{aligned}
$$

## ポイント

- **MUS と最小補正集合（MCS / MaxSAT 修復）の双対性**: 任意の極小矛盾コア $C$ に対して、修復のために緩和されるソフトルール集合 $R$ は必ず $C \cap R \ne \emptyset$ を満たします（ヒット集合双対性）。そのため、複数の矛盾に共通するソフトルールを緩和すると総修復コストを抑えられます。
- **`check()` による診断と `solve()` による修復合成の連携**: 原因箇所の特定は `m.check({ solver: "z3" })`、全体最適の修復計算は `m.solve({ solver: "z3" })` に分担させる設計が自然です。
- 用語の確認: [ガイド・用語集 — 解の状態](?view=guide&lang=ja#solver-status) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const initial = await checkRulesSubset(input, new Set(allIds));
if (initial.res.status === "Sat") {
  return { consistent: true, minimalCore: [], relaxedRules: [], repairCost: 0, repairedAssignment: initial.assignment };
}
// Stage 2: deletion-based contraction -> minimalCore
// Stage 3: Weighted MaxSAT via m.solve({ solver: "z3" }) -> relaxedRules & repairCost
```
