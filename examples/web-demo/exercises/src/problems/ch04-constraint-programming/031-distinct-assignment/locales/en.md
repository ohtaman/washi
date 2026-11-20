# #031. Distinct Channel Assignment

<!-- section:scenario -->
A wireless operator must assign an integer frequency channel between 0 and numChannels - 1 to each of several transmitters. No two transmitters may share the same channel.

In addition, each pair of co-located interfering transmitters must be separated by at least 2 channel steps in absolute frequency difference. Assigning transmitter i to channel c incurs weighted spectrum cost weights[i] * c; minimize total weighted channel cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numChannels` | `number` | Number of available integer channels (`0` to `numChannels - 1`) |
| `weights` | `number[]` | Spectrum cost weight per transmitter (`cost = sum(weights[i] * channels[i])`) |
| `adjacentConflicts` | `number[][]` | Pairs `[u, v]` requiring `abs(channels[u] - channels[v]) >= 2` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `channels` | `number[]` | Assigned integer channel in `[0, numChannels - 1]` for each transmitter |
| `totalCost` | `number` | Minimized weighted channel cost |

<!-- section:example -->
**Input**

```json
{
  "numChannels": 4,
  "weights": [10, 6, 4],
  "adjacentConflicts": [
    [0, 1]
  ]
}
```

**Output**

```json
{
  "channels": [0, 2, 1],
  "totalCost": 16
}
```

Channels `[0, 2, 1]` are all distinct in `[0, 3]`, satisfy `|0 - 2| = 2 >= 2` for pair `(0, 1)`, and give weighted cost $10 \times 0 + 6 \times 2 + 4 \times 1 =$ **16**.
