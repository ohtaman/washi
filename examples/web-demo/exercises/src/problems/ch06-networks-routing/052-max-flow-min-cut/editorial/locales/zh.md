## 解题思路

先求解原问题最大流 LP（在边容量与中间节点流量守恒下最大化源点净流出），随后在最优流对应的残量图中从源点执行广度优先搜索（BFS）求出可达集合 $S$，所有从 $S$ 指向不可达集合 $V \setminus S$ 的有向边即构成容量等于最大流的最小 s-t 割。

## 数学模型

$$
\begin{aligned}
\max_{f} \quad & \sum_{e=(s, w)} f_e - \sum_{e=(u, s)} f_e \\
\text{s.t.} \quad & \sum_{e=(v, w)} f_e - \sum_{e=(u, v)} f_e = 0 && \forall v \in V \setminus \{s, t\} \\
& 0 \le f_e \le u_e && \forall e \in E
\end{aligned}
$$

## 核心要点

- **基于残量图可达性的精确割提取**：残量图同时包含未满载的正向边（$f_e < u_e$）和可退流的反向边（$f_e > 0$）。在最大流下不存在从源到汇的增广路，因此可达集 $S$ 满足 $s \in S, t \notin S$，所有离开 $S$ 的边必已满载（$f_e = u_e$）且进入 $S$ 的边流量必为零（$f_e = 0$），从而严格保证割容量之和等于最大流。
- **避免不同求解器的对偶符号差异**：直接通过残量图搜索构造割边集，既不依赖对偶变量的符号约定，也不受退化对偶多面体选点的影响。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

求解最大流 LP 后，沿有剩余容量的正向边与有正流量的反向边从源点执行广度优先搜索（BFS）求出可达集合 `visited`，最后提取满足 `visited[e.from] && !visited[e.to]` 的边作为最小割。

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
