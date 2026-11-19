# #002. Min-Cost Diet Blend (>= & Minimization)

<!-- section:scenario -->
Mix two non-negative ingredients (oats and beans, continuous amounts) to minimize total cost while meeting daily nutrient minimums:

- 1 unit of oats costs 30 and supplies 2 units of protein and 1 unit of fiber.
- 1 unit of beans costs 50 and supplies 1 unit of protein and 3 units of fiber.

Given minimum targets minProtein and minFiber, find the cheapest mix.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `minProtein` | `number` | Required minimum protein |
| `minFiber` | `number` | Required minimum fiber |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `oats` | `number` | Amount of oats ($\ge 0$) |
| `beans` | `number` | Amount of beans ($\ge 0$) |
| `totalCost` | `number` | Minimum total cost |

<!-- section:example -->
**Input**

```json
{
  "minProtein": 8,
  "minFiber": 9
}
```

**Output**

```json
{
  "oats": 3,
  "beans": 2,
  "totalCost": 190
}
```

Using `3` units of oats and `2` units of beans yields `8` protein, `9` fiber, and minimum cost `190`.
