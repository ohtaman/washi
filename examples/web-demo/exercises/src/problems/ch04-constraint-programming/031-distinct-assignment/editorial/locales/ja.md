## アプローチ

各送信局のチャネル番号を有界整数変数 `channels[i]`（`0 .. numChannels - 1`）で表し、グローバル制約 `distinct(channels)` で重複を禁止し、干渉ペアに対して `abs(channels[u] - channels[v]) >= 2` を課したうえで `dot(weights, channels)` を Pumpkin で最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} w_i \, c_i \\
\text{s.t.} \quad & \text{AllDifferent}(c_0, \dots, c_{n-1}) \\
& |c_u - c_v| \ge 2 && \forall (u, v) \in E_{\text{adj}} \\
& c_i \in \{0, \dots, M - 1\} \cap \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **0-1 行列を使わない整数ドメインモデリング**: MIP のように $n \times M$ 個のバイナリ変数を張る代わりに、各送信局に 1 つの整数変数 `channels[i]` を持たせ、Pumpkin が要求する有限整数上下界 `{ lb: 0, ub: numChannels - 1 }` を必ず明示します。
- **`distinct()` と `abs()` の直接記述**: `distinct(channels)` が全ペアの相異をまとめて伝播し、`expr\`abs(\${channels[u]} - \${channels[v]}) >= 2\`` は Big-M を書かずにネイティブの絶対値プロパゲータへ変換されます。
- 関連リファレンス: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const channels = m.integer(n, { lb: 0, ub: input.numChannels - 1, prefix: "ch" });

m.constraint(distinct(channels), "distinct_channels");
m.constraint(
  input.adjacentConflicts.map(
    ([u, v]) => expr`abs(${channels[u]} - ${channels[v]}) >= 2`
  )
);

m.objective(minimize(expr`dot(${input.weights}, ${channels})`));
await m.solve({ solver: "pumpkin" });
```
