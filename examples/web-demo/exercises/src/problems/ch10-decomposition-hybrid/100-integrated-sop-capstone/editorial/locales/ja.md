## アプローチ

**Z3 SMT** による矛盾診断と **HiGHS MIP** による最小変更再計画を連結します。

1. **第 1 段階（IHS 重み付き MaxSAT 修復）**: Z3 モデルに総容量制約 $\sum_i C_i u_i \ge D$ と各ハード制約・ソフト方針をルール ID 名付きで登録します。`smt.check({ solver: "z3" })` が `"Unsat"` を返したら、`res.unsatCore` に含まれるソフト方針群をヒットセット制約として HiGHS の 0-1 MIP に渡し、解除重み合計最小の候補で反復して `"Sat"` を得ます。
2. **第 2 段階（最小変更 MIP 再スケジュール）**: 修復済みルール集合のもとで 0-1 稼働 $y_i$、連続生産 $q_i$、基準差分 $\delta_i \ge |y_i - b_i|$ を最適化します。

## 数理モデル

$$
\begin{aligned}
\text{(Phase 1 IHS)} \quad \min \quad & \sum_{r \in \mathcal{S}} w_r z_r \\
\text{s.t.} \quad & \sum_{r \in \mathcal{C} \cap \mathcal{S}} z_r \ge 1 && \forall \text{ Z3 core } \mathcal{C}, \quad z_r \in \{0, 1\}
\end{aligned}
$$

$$
\begin{aligned}
\text{(Phase 2 MIP)} \quad \min \quad & \sum_{i} \big(F_i y_i + c_i q_i + P_{\text{disrupt}} \delta_i\big) \\
\text{s.t.} \quad & 0 \le q_i \le C_i y_i, \quad \sum_i q_i \ge D, \quad \delta_i \ge y_i - b_i, \quad \delta_i \ge b_i - y_i \\
& \text{残存ルール } \mathcal{H} \cup \{r \in \mathcal{S} : z_r = 0\}, \quad y_i \in \{0, 1\}
\end{aligned}
$$

## ポイント

- **IHS による大域最小修復重みの保証**: 単一コアごとに貪欲に 1 本ずつ解除するのではなく、これまでに抽出されたすべてのコアを同時にカバーする最小重みヒットセット MIP を毎回解き直すことで多重競合でも厳密最適になります。
- **含意ルールの線形化**: 第 2 段階の MIP では `ifLine => thenLine` を $y_{\text{if}} - y_{\text{then}} \le 0$、`ifLine => !thenLine` を $y_{\text{if}} + y_{\text{then}} \le 1$ として厳密に表せます。
- **絶対値差分の線形化**: 補助線形制約 $\delta_i \ge y_i - b_i$ かつ $\delta_i \ge b_i - y_i$ を課すことで、目的関数へ定数項を入れずに変更ペナルティを厳密に計算できます。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [ソルバステータス](?view=guide&lang=ja#solver-status)

## 実装の勘所

第 1 段階の Implicit Hitting Set ループでは、`checkPolicyWithZ3` が返した UNSAT コアからソフト方針のみを抽出して `hittingSets` に追加し（コアにソフト方針が含まれない場合のフォールバックとして、現在有効なソフト方針 ID 一覧を返す `activeSoftIds(droppedSet)` を使用します）、`solveHittingSetMip` で最小重みの解除集合 `droppedSet` を更新しながら `"Sat"` に到達するまで反復します。

**WaSHI (TypeScript)**

```ts
for (let iter = 0; iter <= 1 << input.softRules.length; iter++) {
  const audit = await checkPolicyWithZ3(input, droppedSet);
  if (audit.sat) break;
  const coreSoft = audit.core.filter((id) => softById.has(id));
  hittingSets.push(coreSoft.length > 0 ? coreSoft : activeSoftIds(droppedSet));
  droppedSet = await solveHittingSetMip(input.softRules, hittingSets);
}
```
