# #019. 分段全量折扣采购优化

<!-- section:scenario -->
某采购团队需要向多家候选供应商采购原材料，总量至少满足既定需求。每家供应商均设有多个批量报价档位：如果向某家供应商下单，则必须选中其中**一个**档位，使该供应商的连续订货量落在该档位的上下限之间，并且向该供应商采购的所有数量全部按该档位单价结算。

如果某家供应商未被选中，则其所有档位均不激活且订货量为零。请在满足总需求的前提下合理分配向各供应商下单的档位与数量，以**最小化总采购成本**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `demand` | `number` | 所有供应商采购总量的最低需求 |
| `suppliers` | `{ minQty: number; maxQty: number; unitPrice: number }[][]` | 各供应商 $s$ 的阶梯报价档位列表 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tierSelected` | `number[][]` | 每个供应商 $s$ 与档位 $k$ 的 `0`/`1` 选中矩阵 |
| `tierQuantities` | `number[][]` | 各档位下的连续采购数量 |
| `totalCost` | `number` | 最小化后的总采购成本 |

<!-- section:example -->
**输入示例**

```json
{
  "demand": 60,
  "suppliers": [
    [
      { "minQty": 10, "maxQty": 30, "unitPrice": 11 },
      { "minQty": 35, "maxQty": 50, "unitPrice": 8.5 }
    ],
    [
      { "minQty": 5, "maxQty": 20, "unitPrice": 10 },
      { "minQty": 25, "maxQty": 45, "unitPrice": 8.8 }
    ]
  ]
}
```

**输出示例**

```json
{
  "tierSelected": [[0, 1], [0, 1]],
  "tierQuantities": [[0, 35], [0, 25]],
  "totalCost": 517.5
}
```

两家供应商均选用第 1 档位并分别采购 `35`（属于 `[35, 50]`）与 `25`（属于 `[25, 45]`），总量 $35 + 25 = 60 \ge 60$，总采购成本为 $35 \times 8.5 + 25 \times 8.8 =$ **517.5**。
