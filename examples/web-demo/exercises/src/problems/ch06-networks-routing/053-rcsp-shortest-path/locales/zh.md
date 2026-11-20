# #053. 资源受限最短路径 (RCSP)

<!-- section:scenario -->
在有向网络中需要选择一条从源点到汇点的简单路径传输数据包。每条有向边既有通行费用，也有时延或能耗等资源消耗，且整条路径的累计资源消耗不得超过预算上限。

请使用 0-1 选边变量、单位 s-t 流量守恒约束以及资源上限不等式建立整数规划模型，**最小化路径总费用**。

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
