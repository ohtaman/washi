# #011. Semi-Continuous Batch Production

<!-- section:scenario -->
A chemical plant schedules continuous production quantities across several candidate products sharing a single raw material supply. Each product may either stay completely idle with zero output, or run within a strict operating window between its minimum batch size and maximum batch capacity.

Because every active product draws from the same shared resource limit and earns a known profit margin per unit, choose which products to run and how much of each to produce so as to **maximize total profit margin** within the resource cap.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `margins` | `number[]` | Profit margin per unit produced for each product |
| `minBatches` | `number[]` | Minimum required batch quantity if product is active |
| `maxBatches` | `number[]` | Maximum allowed batch capacity if product is active |
| `resourceUsages` | `number[]` | Shared resource consumed per unit of each product |
| `resourceCap` | `number` | Total available shared resource capacity |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `active` | `number[]` | Binary (`0` or `1`) activation flags per product |
| `quantities` | `number[]` | Continuous production quantities (`0` or in `[minBatches[i], maxBatches[i]]`) |
| `totalMargin` | `number` | Maximized total profit margin |

<!-- section:example -->
**Input**

```json
{
  "margins": [30, 24, 18],
  "minBatches": [8, 15, 5],
  "maxBatches": [20, 30, 15],
  "resourceUsages": [1, 1, 1],
  "resourceCap": 30
}
```

**Output**

```json
{
  "active": [1, 1, 0],
  "quantities": [15, 15, 0],
  "totalMargin": 810
}
```

Activating products 0 and 1 with `quantities = [15, 15, 0]` satisfies `[8, 20]` and `[15, 30]` batch windows while keeping product 2 at zero, using $15 + 15 = 30 \le 30$ resource for total margin $30 \times 15 + 24 \times 15 =$ **810**.
