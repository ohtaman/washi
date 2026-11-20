## アプローチ

各 VM の整数ホスト変数 `hosts[i]` と 0-1 割当指示変数 `assign[i][k]` をチャネリング制約で結び、ホスト負荷 `load[k]`、容量上限、非共有制約 `hosts[u] != hosts[v]` を課します。そのうえで同質ホストの置換対称性を消す `used[k] >= used[k + 1]` と `load[k] >= load[k + 1]` を加え、`sum(used)` を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{K-1} u_k \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} b_{i,k} = 1, \quad h_i = \sum_{k=0}^{K-1} k \, b_{i,k} && \forall i \\
& L_k = \sum_{i=0}^{n-1} s_i b_{i,k}, \quad u_k \le L_k \le C \, u_k && \forall k \\
& h_u \ne h_v && \forall (u, v) \in E_{\text{conf}} \\
& u_k \ge u_{k+1}, \quad L_k \ge L_{k+1} && \forall k \in \{0, \dots, K-2\}
\end{aligned}
$$

## ポイント

- **$K!$ 通りの対称解の削減**: ホスト番号を並べ替えても同じ配置になるため、対称性除去なしでは最適値より少ない台数での実行不能性を $K!$ 通りの順列にわたって探索することになります。`used[k] >= used[k + 1]` と `load[k] >= load[k + 1]` により稼働ホストを先頭に詰め、負荷降順の代表解のみを残せます。
- **異なる対称性除去ルールの混用に注意**: 「負荷降順（`load[k] >= load[k + 1]`）」と「初出順番号付け（`hosts[0] == 0` かつ `hosts[i] <= max(hosts[0..i-1]) + 1`）」はそれぞれ単独では正しいものの、両方を同時に課すと VM 0 が最大負荷ホストに入らない最適解を誤って切り捨ててしまいます。
- 関連リファレンス: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(input.conflicts.map(([u, v]) => expr`${hosts[u]} != ${hosts[v]}`));

// Break identical-host permutation symmetry (prefix active + non-increasing load)
m.constraint(used.slice(0, -1).map((u, k) => expr`${u} >= ${used[k + 1]}`));
m.constraint(load.slice(0, -1).map((ld, k) => expr`${ld} >= ${load[k + 1]}`));

m.objective(minimize(sum(used)));
```
