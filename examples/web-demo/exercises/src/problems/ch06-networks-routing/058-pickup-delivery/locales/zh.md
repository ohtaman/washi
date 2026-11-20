# #058. 取送货车辆路径问题 (PDP)

<!-- section:scenario -->
最多 K 辆相同车辆从配送中心 0 出发服务多笔成对的取送货订单，每笔订单包含取货点、送货点及货物重量。同一订单的取货与送货必须由同一辆车完成且先取后送，沿途任一时刻车上累计载重不得超过容量上限，同时单车停靠的客户站点数也不得超过上限。

请将该取送货车辆路径问题建模为混合整数规划（MIP），**最小化总行驶距离**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `dist` | `number[][]` | $N \times N$ 距离矩阵（`0` 为配送中心，`1..N-1` 为取送货站点） |
| `requests` | `Array<{ pickup, delivery, demand }>` | 订单列表（取货点 `pickup`、送货点 `delivery`、货量 `demand`） |
| `capacity` | `number` | 单车最大载重容量 $Q$ |
| `maxVehicles` | `number` | 最多可派出的车辆数 |
| `maxStopsPerVehicle` | `number` | 单辆车最多可访问的非场站站点数量 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `routes` | `number[][]` | 车辆路径列表，每条均形如 `[0, ..., 0]` |
| `totalDistance` | `number` | 最小化后的全部路径总里程 |

<!-- section:example -->
**输入示例**

```json
{
  "dist": [
    [0, 2, 7, 4, 8],
    [2, 0, 5, 1, 6],
    [7, 5, 0, 4, 1],
    [4, 1, 4, 0, 5],
    [8, 6, 1, 5, 0]
  ],
  "requests": [
    { "pickup": 1, "delivery": 2, "demand": 3 },
    { "pickup": 3, "delivery": 4, "demand": 4 }
  ],
  "capacity": 7,
  "maxVehicles": 1,
  "maxStopsPerVehicle": 4
}
```

**输出示例**

```json
{
  "routes": [
    [0, 1, 3, 2, 4, 0]
  ],
  "totalDistance": 16
}
```

路线 `[0, 1, 3, 2, 4, 0]` 先于站点 1（载重 3）和站点 3（载重 7 ≤ 7）完成两次取货，再依次前往站点 2 与 4 卸货，满足配对、先后序与停靠限制，总距离为 $2 + 1 + 4 + 1 + 8 =$ **16**。
