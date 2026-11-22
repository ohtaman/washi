# #054. DJ Setlist Sequencing

<!-- section:scenario -->
A DJ starts a live set with opener track 0, must play every other track in the crate exactly once, and finish by transitioning back into track 0 for the encore. Because tempo drops, key clashes, and energy shifts depend on playback direction, the jarring cost of playing track j right after track i can differ from playing i after j.

Sequence all tracks into a single closed cycle with no disconnected loops and **minimize total transition-jarring cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `transitions` | `number[][]` | $n \times n$ asymmetric transition-jarring matrix (`transitions[i][j]` from track `i` to `j`) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `setlist` | `number[]` | Playback order of all $n$ tracks starting at `0` (`setlist[0] = 0`) |
| `totalCost` | `number` | Minimized total closed-cycle transition-jarring cost |

<!-- section:example -->
**Input**

```json
{
  "transitions": [
    [0, 11, 3, 8],
    [9, 0, 12, 2],
    [2, 6, 0, 10],
    [7, 4, 5, 0]
  ]
}
```

**Output**

```json
{
  "setlist": [0, 2, 1, 3],
  "totalCost": 18
}
```

Playing `0 -> 2 -> 1 -> 3 -> 0` covers all four tracks in one cycle with total jarring cost $3 + 6 + 2 + 7 =$ **18**.

<!-- section:hint1 -->
Model one binary transition variable for every ordered pair of distinct tracks, plus one continuous playback-position potential variable for each non-opener track. Enforce that every track has exactly one incoming transition and one outgoing transition, then minimize total transition cost.

<!-- section:hint2 -->
Degree constraints alone allow disconnected mini-loops. Add Miller-Tucker-Zemlin (MTZ) precedence constraints on non-opener transitions `(i, j)`—forcing $u_i + 1 \le u_j$ whenever `x[i][j] == 1` via $u_i - u_j + n x_{ij} \le n - 1$—so only a single cycle anchored at track 0 is feasible, and reconstruct `setlist` by following the chosen transitions from track 0.
