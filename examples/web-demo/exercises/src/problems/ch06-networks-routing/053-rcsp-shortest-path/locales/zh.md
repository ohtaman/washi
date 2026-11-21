# #053. 资源受限最短路径 (RCSP)

<!-- section:scenario -->
在有向网络中需要选择一条从源点到汇点的简单路径传输数据包。每条有向边既有通行费用，也有时延或能耗等资源消耗，且整条路径的累计资源消耗不得超过预算上限。

选择一条累计资源消耗不超过预算上限、从源点到汇点的简单路径，并 **最小化路径总费用**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `nodeCount` | `number` | 节点数（`0 .. nodeCount - 1`） |
| `source` | `number` | 源点编号 $s$ |
| `sink` | `number` | 汇点编号 $t$ |
| `maxResource` | `number` | 允许的最大累计资源消耗 $R$ |
| `edges` | `Array<{ from, to, cost, resource }>` | 带有费用 `cost` 和资源消耗 `resource` 的有向边 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `selected` | `number[]` | 表示每条边是否被选中的 `0`/`1` 数组 |
| `totalCost` | `number` | 所选路径的最小化总费用 |

<!-- section:example -->
**输入示例**

```json
{
  "nodeCount": 5,
  "source": 0,
  "sink": 4,
  "maxResource": 10,
  "edges": [
    { "from": 0, "to": 1, "cost": 2, "resource": 6 },
    { "from": 0, "to": 2, "cost": 4, "resource": 3 },
    { "from": 1, "to": 3, "cost": 2, "resource": 5 },
    { "from": 1, "to": 4, "cost": 5, "resource": 6 },
    { "from": 2, "to": 1, "cost": 1, "resource": 2 },
    { "from": 2, "to": 3, "cost": 3, "resource": 4 },
    { "from": 3, "to": 4, "cost": 2, "resource": 3 }
  ]
}
```

**输出示例**

```json
{
  "selected": [0, 1, 0, 0, 0, 1, 1],
  "totalCost": 9
}
```

路径 `0 -> 2 -> 3 -> 4` 的总资源消耗为 $3 + 4 + 3 = 10 \le 10$，总费用为 $4 + 3 + 2 =$ **9**。

<!-- section:hint1 -->
为每条有向边定义一个二进制决策变量，表示是否将其选入路径。按节点施加从 `source` 到 `sink` 发送 1 单位流量的守恒约束，再加入全局资源预算限制，并最小化总通行费用。

<!-- section:hint2 -->
与无约束最短路径不同，加入资源背包约束会破坏全幺模性，因此必须使用二进制变量（而非连续 LP）以防止路径出现分数拆分。此外，由于所有边的费用均为正，任何满足流量守恒的孤立环路都会严格增大目标值，因此无需额外的消环约束即可保证最优解为简单路径。
