# #038. 带对称性破除的虚拟机装箱

<!-- section:scenario -->
某云集群拥有 numHosts 台同构物理宿主机，每台宿主机具有相同的资源容量上限 capacity。现需部署 n 台虚拟机，其中第 i 台虚拟机占用所属宿主机 sizes[i] 的容量。

冲突列表 conflicts 中的任意互斥对 [u, v] 不能部署在同一台宿主机上，且每台宿主机的负载之和不能超过 capacity。请为每台虚拟机分配 0 到 numHosts - 1 的宿主机编号，并最小化开启的宿主机总数。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `numHosts` | `number` | 同构物理宿主机总数（编号 `0` 到 `numHosts - 1`） |
| `capacity` | `number` | 每台宿主机的统一容量上限 |
| `sizes` | `number[]` | 每台虚拟机的正整数资源需求 |
| `conflicts` | `number[][]` | 禁止同机的反亲和互斥对 `[u, v]`（`hosts[u] != hosts[v]`） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `hosts` | `number[]` | 每台虚拟机分配到的宿主机编号（`0` 到 `numHosts - 1`） |
| `usedHosts` | `number` | 最小化后的启用宿主机数 |

<!-- section:example -->
**输入示例**

```json
{
  "numHosts": 4,
  "capacity": 10,
  "sizes": [4, 4, 7, 3],
  "conflicts": [
    [0, 1]
  ]
}
```

**输出示例**

```json
{
  "hosts": [2, 0, 1, 0],
  "usedHosts": 3
}
```

宿主机 0 承载 `{1, 3}`（负载 $4 + 3 = 7 \le 10$），宿主机 1 承载 `{2}`（负载 $7 \le 10$），宿主机 2 承载 `{0}`（负载 $4 \le 10$），互斥对 `(0, 1)` 分处不同宿主机，总计开启 **3** 台宿主机。
