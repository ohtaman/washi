# #017. Maximal Covering Location (MCLP)

<!-- section:scenario -->
A municipal planner wants to place emergency response stations across several candidate sites, with a budget allowing at most a fixed maximum number of open stations. Each demand zone has a known population demand and is considered covered if at least one open station lies at or within the service coverage radius.

Because the station limit may prevent covering every zone simultaneously, choose which candidate sites to open to **maximize total covered demand**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Demand weight (population) of each zone $i$ |
| `distances` | `number[][]` | Matrix where `distances[i][j]` is distance from zone $i$ to site $j$ |
| `coverageRadius` | `number` | Maximum distance for a station to cover a zone |
| `maxFacilities` | `number` | Maximum number of candidate sites that can be opened |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[]` | Binary (`0` or `1`) opening choices per candidate site |
| `covered` | `number[]` | Binary (`0` or `1`) coverage indicators per demand zone |
| `totalCoveredDemand` | `number` | Maximized sum of demands of covered zones |

<!-- section:example -->
**Input**

```json
{
  "demands": [40, 35, 30, 25, 22],
  "distances": [
    [2, 6, 8, 9],
    [3, 4, 7, 8],
    [6, 2, 4, 7],
    [9, 5, 3, 2],
    [8, 7, 6, 3]
  ],
  "coverageRadius": 5,
  "maxFacilities": 2
}
```

**Output**

```json
{
  "open": [1, 1, 0, 0],
  "covered": [1, 1, 1, 1, 0],
  "totalCoveredDemand": 130
}
```

Opening sites 0 and 1 ($2 \le 2$) puts a station within radius 5 of zones 0, 1, 2, and 3, covering total demand $40 + 35 + 30 + 25 =$ **130**.
