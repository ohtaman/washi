# #038. 含对称破缺的图着色

<!-- section:scenario -->
给定一个包含 numNodes 个顶点的无向图及其边列表 edges，为每个顶点分配 0 到 maxColors - 1 之间的整数颜色，使得每条边连接的两个端点颜色不同。

请在所有合法着色方案中，最小化所使用的不同颜色总数。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `numNodes` | `number` | 图的顶点数（`0` 到 `numNodes - 1`） |
| `maxColors` | `number` | 可用颜色编号数量上限（`0` 到 `maxColors - 1`） |
| `edges` | `number[][]` | 要求 `colors[u] != colors[v]` 的无向边 `[u, v]` |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `colors` | `number[]` | 每个顶点分配的颜色编号（位于 `[0, maxColors - 1]`） |
| `usedColors` | `number` | 使用的不同颜色数量的最小值 |

<!-- section:example -->
**输入**

```json
{
  "numNodes": 5,
  "maxColors": 5,
  "edges": [
    [0, 1],
    [1, 2],
    [2, 0],
    [2, 3],
    [3, 4]
  ]
}
```

**输出**

```json
{
  "colors": [0, 1, 2, 0, 2],
  "usedColors": 3
}
```

每条边 `(0, 1)`、`(1, 2)`、`(2, 0)`、`(2, 3)`、`(3, 4)` 的两端颜色均不相同，共使用了 `{0, 1, 2}` 这 **3** 种颜色。

<!-- section:hint1 -->
为每个顶点声明一个整数颜色变量，并用一个整数变量追踪已使用的最大颜色编号。由于颜色编号可以任意置换而保持合法性，通过强制顶点按顺序无跳号地引入新颜色来打破值对称，然后最小化所用的颜色总数。

<!-- section:hint2 -->
对每条边施加 `colors[u] != colors[v]`。通过 `colors[0] == 0` 以及对 `i >= 1` 施加 `colors[i] <= 1 + max(colors.slice(0, i))` 打破颜色置换对称性；再约束所有 `colors[i] <= maxColor`，并用 `solver: "pumpkin"` 最小化 `maxColor + 1`。
