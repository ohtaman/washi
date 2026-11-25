## アプローチ

無向辺（$0 \le i < j < n$）ごとにバイナリ変数 $x_{ij} \in \{0, 1\}$ を置き、全都市の次数が 2 になる 2-マッチング緩和から始めます。整数解のグラフから連結成分（閉路）を抽出し、複数に分かれていれば各部分巡回路 $S$ に対して DFJ カット $\sum_{i,j \in S, i < j} x_{ij} \le |S| - 1$ を追加して再求解を繰り返します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{0 \le i < j < n} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j < i} x_{ji} + \sum_{j > i} x_{ij} = 2 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{\substack{i, j \in S \\ i < j}} x_{ij} \le |S| - 1 && \forall \text{ 分離された部分巡回路 } \emptyset \neq S \subsetneq V \\
& x_{ij} \in \{0, 1\} && \forall 0 \le i < j < n
\end{aligned}
$$

## ポイント

- **必要に応じた遅延カット生成**: 非空の真部分集合の総数は $2^n - 2$ 個ありますが、違反が観測された部分巡回路にだけ DFJ カットを追加することでごく少数の反復で厳密解に到達できます。
- **マルチカット分離**: 反復内で見つかったすべての部分巡回路に対して同時にカットを追加すると、再求解回数を大幅に削減できます（WaSHI の `master.solveBenders` で `kind: "feasibility"` カットとして書くこともできます）。
- **無向グラフでは 2 都市閉路が起きない**: 各無向辺に 1 変数しか置かないため長さ 2 の巡回路は構造上存在せず、最小の部分巡回路サイズは 3 になります（そのため $n=5$ は初回で単一閉路となり、$n \ge 6$ では $3+3$ などの分割が生じ得ます）。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [解の状態に関する用語](?view=guide&lang=ja#solver-status)

## 実装の勘所

同一のモデルインスタンス（WaSHI の `Model`、PuLP の `LpProblem`）を保持したまま `while` ループで再求解し、単一の巡回路でなければ見つかった各部分巡回路 `comp` に対して DFJ カットを逐次追加します。`extractCycles`（Python では `extract_cycles`）が選択辺の連結成分を抽出し、`collectInternalEdges` が各部分巡回路の内部辺を集めます。

**WaSHI (TypeScript)**

```ts
while (true) {
  iterations++;
  await m.solve();
  const components = extractCycles(edges, n);
  if (components.length === 1) {
    finalTour = components[0];
    break;
  }
  components.forEach((comp, idx) => {
    const internalEdges = collectInternalEdges(comp, edges);
    m.constraint(expr`sum(${internalEdges}) <= ${comp.length - 1}`, `dfj_${iterations}_${idx}`);
  });
}
```

**PuLP (Python)**

```python
while True:
    iterations += 1
    prob.solve(pulp.HiGHS(msg=False))
    components = extract_cycles(edges, n)
    if len(components) == 1:
        final_tour = components[0]
        break
    for comp in components:
        prob += pulp.lpSum(edges[(min(a, b), max(a, b))] for i, a in enumerate(comp) for b in comp[i + 1:]) <= len(comp) - 1
```
