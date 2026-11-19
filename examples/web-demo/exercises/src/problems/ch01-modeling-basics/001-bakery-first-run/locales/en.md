# #001. Bakery Production LP

<!-- section:scenario -->
A bakery makes croissants and loaves (both continuous and non-negative) to maximize total profit within limited flour and butter stocks:

- Each croissant yields profit 40 and uses 2 units of flour and 1 unit of butter.
- Each loaf yields profit 70 and uses 3 units of flour and 2 units of butter.

Given flour limit flourCap and butter limit butterCap, add the missing butter constraint to maximize total profit.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `flourCap` | `number` | Available flour limit |
| `butterCap` | `number` | Available butter limit |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `croissants` | `number` | Croissants produced ($\ge 0$) |
| `loaves` | `number` | Loaves produced ($\ge 0$) |
| `totalProfit` | `number` | Maximum total profit |

<!-- section:example -->
**Input**

```json
{
  "flourCap": 120,
  "butterCap": 70
}
```

**Output**

```json
{
  "croissants": 30,
  "loaves": 20,
  "totalProfit": 2600
}
```

Producing `30` croissants and `20` loaves uses $2(30) + 3(20) = 120$ flour and $30 + 2(20) = 70$ butter, achieving maximum profit `2600`.
