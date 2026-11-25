## アプローチ

主問題としての最大流 LP（中間頂点の保存則と枝容量制約のもとで始点からの純流出を最大化）を解いた後、得られた最適フローの残余グラフ上で始点から幅優先探索（BFS）を行い、到達可能集合 $S$ から到達不能集合 $V \setminus S$ へ向かう枝を最小 s-t カットとして抽出します。

## 数理モデル

$$
\begin{aligned}
\max_{f} \quad & \sum_{e=(s, w)} f_e - \sum_{e=(u, s)} f_e \\
\text{s.t.} \quad & \sum_{e=(v, w)} f_e - \sum_{e=(u, v)} f_e = 0 && \forall v \in V \setminus \{s, t\} \\
& 0 \le f_e \le u_e && \forall e \in E
\end{aligned}
$$

## ポイント

- **残余グラフによる確実な最小カット抽出**: 残余グラフには順方向（$f_e < u_e$）と逆方向（$f_e > 0$）の両方の辺が含まれます。最適フローでは始点から終点への増加パスが存在しないため、到達可能集合 $S$ は $s \in S, t \notin S$ を満たし、$S$ から出る枝はすべて飽和（$f_e = u_e$）、$S$ へ入る枝はすべて流量 0 となって、カット容量の和が最大流量に厳密に一致します。
- **双対変数の符号依存を回避**: LP ソルバーの双対変数は実装や退化時の頂点選択で符号・値が揺れることがありますが、残余グラフの到達可能性から構成する方法なら常に正規の最小カットが得られます。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

最大流 LP を解いた後、残余容量がある順方向枝と正のフローが流れている逆方向枝を辿って始点から幅優先探索（BFS）を行い、到達可能集合 `visited` を求めます。最後に `visited[e.from] && !visited[e.to]` を満たす枝を最小カットとして抽出します。

**WaSHI (TypeScript)**

```ts
const visited = new Array(n).fill(false);
visited[input.source] = true;
const queue = [input.source];
while (queue.length > 0) {
  const u = queue.shift()!;
  input.edges.forEach((e, i) => {
    if (e.from === u && !visited[e.to] && flowVals[i] < e.cap - 1e-6) {
      visited[e.to] = true;
      queue.push(e.to);
    }
    if (e.to === u && !visited[e.from] && flowVals[i] > 1e-6) {
      visited[e.from] = true;
      queue.push(e.from);
    }
  });
}
const cutEdges = input.edges
  .map((_, i) => i)
  .filter((i) => visited[input.edges[i].from] && !visited[input.edges[i].to]);
```

**PuLP (Python)**

```python
visited = [False] * n
visited[s] = True
queue = [s]
while queue:
    u = queue.pop(0)
    for i, e in enumerate(edges):
        if e["from"] == u and not visited[e["to"]] and flow_vals[i] < e["cap"] - 1e-6:
            visited[e["to"]] = True
            queue.append(e["to"])
        if e["to"] == u and not visited[e["from"]] and flow_vals[i] > 1e-6:
            visited[e["from"]] = True
            queue.append(e["from"])
cut_edges = [i for i, e in enumerate(edges) if visited[e["from"]] and not visited[e["to"]]]
```
