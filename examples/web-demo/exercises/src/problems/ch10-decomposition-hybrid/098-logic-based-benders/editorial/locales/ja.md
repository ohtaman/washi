## アプローチ

`master.solveBenders` を用いて論理ベース Benders 分解（LBBD）を構築します。HiGHS の 0-1 主問題が割当コスト最小化を担当し、子問題では機械ごとに Pumpkin CP ソルバ（`disjoint` 制約と時間枠境界）を実行して実行可能性を検証します。ある機械で `Unsat` となったジョブ集合 $S_m$ に対しては、削除法による極小競合集合 $K_m \subseteq S_m$ を抽出し、ノーグッドカットを追加します。

## 数理モデル

$$
\begin{aligned}
\text{(Master)} \quad \min \quad & \sum_{j=0}^{N-1} \sum_{m=0}^{M-1} c_{jm} x_{jm} \\
\text{s.t.} \quad & \sum_{m=0}^{M-1} x_{jm} = 1 && \forall j \\
& \sum_{j \in K} x_{jm} \le |K| - 1 && \forall (K, m) \in \mathcal{N}_{\text{no-good}}, \quad x_{jm} \in \{0, 1\}
\end{aligned}
$$

$$
\begin{aligned}
\text{(CP Sub}_m(S_m)\text{)} \quad \text{find } & s_j \in [\text{rel}_j,\ \min(\text{dl}_j, H) - p_j] \cap \mathbb{Z} && \forall j \in S_m \\
\text{s.t.} \quad & \text{disjoint}\big(\{(s_j, p_j) : j \in S_m\}\big)
\end{aligned}
$$

## ポイント

- **`theta` 不要の純粋実行可能性カット**: 目的関数 $c_{jm} x_{jm}$ は主問題側で完全に評価されるため補助変数 `theta` は不要です。すべての機械の CP 子問題が `"Sat"` となり `null` を返した瞬間に大域最適が証明されます。
- **極小競合集合によるカット強化**: 実行不可能な割当 $S_m$ をそのまま禁止するのではなく、`check({ solver: "pumpkin" })` の削除法テストで極小実行不可能部分集合 $K_m$ まで縮約することで、不要な組合せを一括排除して反復回数を大幅に削減できます。
- **時間枠の事前チェック**: 変数生成前に `ub >= lb` を検証し、単一ジョブでも時間枠違反なら $|K_m| = 1$ のカットとして安全に処理します（2 ジョブ以上で `disjoint` を課します）。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

`master.solveBenders` の `subproblem` 内で各加工機 `m` に割り当てられた工程集合を `checkMachineSchedule`（Pumpkin CP の `disjoint` 制約）で検証し、`Unsat` となった加工機に対しては極小競合集合を抽出してノーグッドカットを返します。

**WaSHI (TypeScript)**

```ts
const bendersRes = await master.solveBenders({
  maxIterations: 200,
  subproblem: async ({ getMasterValue }) => {
    const cuts: BendersCut[] = [];
    for (const m of Array.from({ length: M }, (_, idx) => idx)) {
      const assigned = jobs.filter((j) => getMasterValue(x[j][m]) > 0.5);
      const check = await checkMachineSchedule(input, assigned);
      if (check.sat) continue;
      let minimal = [...assigned];
      for (const j of assigned) {
        const reduced = minimal.filter((k) => k !== j);
        if (reduced.length > 0 && !(await checkMachineSchedule(input, reduced)).sat) minimal = reduced;
      }
      cuts.push({
        kind: "feasibility",
        constraint: expr`sum(${minimal.map((j) => x[j][m])}) <= ${minimal.length - 1}`,
      });
    }
    return cuts.length > 0 ? cuts : null;
  },
});
```
