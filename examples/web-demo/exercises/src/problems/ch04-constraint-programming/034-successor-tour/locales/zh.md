# #034. 基于后继变量与位次数组的哈密顿回路

<!-- section:scenario -->
配送计划负责人正在为配送车辆规划单一闭合巡回路径：车辆从仓库（节点 0）出发，恰好访问每个客户节点各一次后返回仓库。任意有序节点对之间都给定了有向整数行驶距离（km），往返两个方向的距离可能不同（非对称）。

请决定每个节点之后紧接着访问的后继节点，在不产生孤立子环的前提下用一条闭合回路遍历所有节点，并最小化总行驶距离（km）。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `distances` | `number[][]` | `n × n` 有向整数距离矩阵（`distances[i][j]` 表示从节点 `i` 到 `j` 的行驶距离［km］，可能非对称，即 `distances[i][j]` 与 `distances[j][i]` 可能不同） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `next` | `number[]` | 节点 `i` 之后紧接着访问的后继节点编号（`0` 到 `n - 1`） |
| `totalDistance` | `number` | 最小化后的总巡回距离 `sum(distances[i][next[i]])`（km） |

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

当 `next` 为 [1, 2, 3, 0] 时，构成遍历全部节点的单一闭合回路 0 -> 1 -> 2 -> 3 -> 0，总距离为 $2 + 4 + 2 + 6 =$ **14** km。

<!-- section:hint1 -->
为每个节点定义一个取值在 `[0, n - 1]` 且无自环、互不相同的后继节点变量。为消除断开的子环（subtour），再为每个节点引入一个从仓库 0 开始计数的访问次序（rank）辅助整数变量。

<!-- section:hint2 -->
施加 `distinct(next)`、`distinct(rank)`、`rank[0] == 0` 以及 `at(rank, next[0]) == 1`。对每个客户节点 $i \ge 1$，使用 ``implies(expr`${next[i]} != 0`, expr`at(${rank}, ${next[i]}) == ${rank[i]} + 1`)`` 串联访问次序，并用 `solver: "pumpkin"` 最小化 `sum(input.distances.map((row, i) => at(row, next[i])))`。
