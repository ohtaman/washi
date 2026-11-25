# #082. Share-House Room & Fair Rent Division

<!-- section:scenario -->
Several roommates are moving into a share-house with an equal number of private rooms and a fixed total monthly rent. Each roommate has a personal valuation for each room, and their surplus is their valuation of the room they receive minus the rent they pay for it.

Determine the room assignment and rent split in two stages:

- **Stage 1**: Assign each roommate to a distinct room to **maximize the total roommate valuation**.
- **Stage 2**: Keeping that optimal room assignment, set non-negative room rents that sum to the total monthly rent, guarantee that no roommate prefers another roommate's room at its assigned rent (envy-freeness), and **maximize the minimum roommate surplus** so the rent split is as fair as possible.

All problem instances are guaranteed to admit a non-negative envy-free rent split at an optimal Stage-1 assignment.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `valuations` | `number[][]` | Matrix where `valuations[i][r]` is roommate `i`'s valuation for room `r` |
| `totalRent` | `number` | Total monthly rent to be divided across all rooms |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignment` | `number[]` | Assigned 0-based room index for each roommate `i` |
| `rents` | `number[]` | Non-negative rent assigned to each room `r` (indexed by room) |
| `totalValuation` | `number` | Total Stage-1 valuation of the chosen room assignment |
| `minSurplus` | `number` | Maximized minimum surplus across all roommates |

<!-- section:example -->
**Input**

```json
{
  "valuations": [
    [800, 500, 400],
    [600, 700, 450],
    [550, 500, 600]
  ],
  "totalRent": 1500
}
```

**Output**

```json
{
  "assignment": [0, 1, 2],
  "rents": [600, 500, 400],
  "totalValuation": 2100,
  "minSurplus": 200
}
```

Assigning roommate $i$ to room $i$ gives total valuation $800 + 700 + 600 = 2100$, and rents `[600, 500, 400]` sum to $600 + 500 + 400 = 1500$ while giving every roommate an envy-free surplus of **200**.

<!-- section:hint1 -->
Split the problem into two sequential models. The first stage is a binary one-to-one assignment problem choosing which roommate gets which room to maximize total valuation. The second stage takes that room assignment as fixed and solves a continuous linear program over room rents and an auxiliary minimum-surplus variable.

<!-- section:hint2 -->
Why is Stage 1 required before Stage 2? An envy-free rent vector exists only when the assignment maximizes total valuation; any suboptimal assignment makes the envy-freeness constraints infeasible. In Stage 2, declare `rents` with `lb: 0` (or `lowBound=0`) and `minSurplus` as an unbounded continuous variable (`lb: -Infinity, ub: Infinity` in WaSHI, `lowBound=None` in PuLP), then constrain every roommate's assigned surplus to be at least `minSurplus` and at least their surplus in every other room.
