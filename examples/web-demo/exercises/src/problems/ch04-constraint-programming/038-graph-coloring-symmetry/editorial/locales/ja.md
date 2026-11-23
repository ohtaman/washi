## アプローチ

各頂点に有限整数変数 `colors[i]`（`0 .. maxColors - 1`）を割り当て、すべての辺に `colors[u] != colors[v]` を課したうえで、先頭から順に色番号を登場させる値対称性破壊（`colors[0] == 0` および `colors[i] <= 1 + max(colors[0..i-1])`）を加えることで、色の置換対称性を取り除き `maxColor + 1` で使用色数を直接最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & c_{\max} + 1 \\
\text{s.t.} \quad & c_u \ne c_v && \forall (u, v) \in E \\
& c_0 = 0 \\
& c_i \le 1 + \max_{j < i} c_j && \forall i \in \{1, \dots, n - 1\} \\
& c_i \le c_{\max} && \forall i \in \{0, \dots, n - 1\} \\
& c_i, c_{\max} \in \{0, \dots, K - 1\} \cap \mathbb{Z}
\end{aligned}
$$

## ポイント

- **$K!$ 通りの色ラベル置換を削減**: 任意の $k$-彩色は色番号の付け替えにより $k! \binom{K}{k}$ 通りの等価な解を持ちます。`colors[0] == 0` と `colors[i] <= 1 + max(colors[0..i-1])` を課すことで、新しい色が `0, 1, 2, ...` の順にのみ出現する正規表現に探索を絞れます。
- **飛び番がないため `maxColor + 1` が正確な使用色数に一致**: 正規番号付けでは色番号に空きが生じないため、使われる色の集合は必ず `{0, ..., maxColor}` となり、バイナリの色使用フラグを別途立てずに `maxColor + 1` を最小化できます。
- 関連リファレンス: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(input.edges.map(([u, v]) => expr`${colors[u]} != ${colors[v]}`), "edge_diff");

// 値対称性破壊: 初出順の正規番号付け
m.constraint(expr`${colors[0]} == 0`, "sym_first");
m.constraint(
  colors.slice(1).map((c, idx) => expr`${c} <= 1 + max(${colors.slice(0, idx + 1)})`),
  "sym_prefix"
);

m.constraint(colors.map((c) => expr`${c} <= ${maxColor}`), "max_color");
m.objective(minimize(expr`${maxColor} + 1`));
```
