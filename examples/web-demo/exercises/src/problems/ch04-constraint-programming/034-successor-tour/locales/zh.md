# #034. 基于后继变量与位次数组的哈密顿回路

<!-- section:scenario -->
一辆配送车从仓库 0 出发，必须恰好访问客户节点 1 到 n - 1 各一次，并最终返回仓库 0 形成单一闭合回路。矩阵元素 distances[i][j] 表示从节点 i 直接驶向节点 j 的距离。

请为每个节点 i 选择紧随其后的后继节点 next[i]，确保不会出现互不相连的子环，并使总行驶距离最小化。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `distances` | `number[][]` | `n × n` 整数距离矩阵（`distances[i][j]` 表示从节点 `i` 到 `j` 的距离） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `next` | `number[]` | 节点 `i` 之后紧接着访问的后继节点编号（`0` 到 `n - 1`） |
| `totalDistance` | `number` | 最小化后的总巡回距离 `sum(distances[i][next[i]])` |

<!-- section:example -->
**输入示例**

```json
{
  "distances": [
    [0, 2, 7, 9],
    [2, 0, 4, 8],
    [7, 4, 0, 2],
    [6, 8, 2, 0]
  ]
}
```

**输出示例**

```json
{
  "next": [1, 2, 3, 0],
  "totalDistance": 14
}
```

沿 `next = [1, 2, 3, 0]` 依次行进构成完整单环 `0 -> 1 -> 2 -> 3 -> 0`，总距离为 $2 + 4 + 2 + 6 =$ **14**。

<!-- section:hint1 -->
为每个节点定义一个取值在 `[0, n - 1]` 且无自环、互不相同的后继节点变量。为消除断开的子环（subtour），再为每个节点引入一个从仓库 0 开始计数的访问次序（rank）辅助整数变量。

<!-- section:hint2 -->
施加 `distinct(next)`、`distinct(rank)`、`rank[0] == 0` 以及 `at(rank, next[0]) == 1`。对每个客户节点 $i \ge 1$，使用 `implies(expr\`${next[i]} != 0\`, expr\`at(${rank}, ${next[i]}) == ${rank[i]} + 1\`)` 串联访问次序，并用 `solver: "pumpkin"` 最小化 `sum(input.distances.map((row, i) => at(row, next[i])))`。
