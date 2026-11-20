# #093. Iterative Subtour Elimination Cuts (DFJ TSP)

<!-- section:scenario -->
Given a symmetric distance matrix over n cities, find a shortest closed Hamiltonian tour visiting every city exactly once. Instead of enumerating exponentially many subtour elimination constraints upfront, start from the 2-matching relaxation where every city has degree 2.

On each iteration, solve the integer program, inspect the active undirected edges for disconnected cycles, add a Dantzig-Fulkerson-Johnson subtour elimination cut for every detected subtour, and re-solve until a single connected tour remains.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `distances` | `number[][]` | Symmetric $n \times n$ pairwise distance matrix ($n \in [5, 8]$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `tour` | `number[]` | Permutation of $0 \dots n-1$ giving the Hamiltonian cycle visit order |
| `totalDistance` | `number` | Minimum closed tour length |
| `iterations` | `number` | Number of MIP solves executed in the iterative DFJ cut loop |

<!-- section:example -->
**Input**

```json
{
  "distances": [
    [0, 3, 4, 25, 26, 27],
    [3, 0, 5, 24, 25, 26],
    [4, 5, 0, 26, 24, 25],
    [25, 24, 26, 0, 4, 3],
    [26, 25, 24, 4, 0, 5],
    [27, 26, 25, 3, 5, 0]
  ]
}
```

**Output**

```json
{
  "tour": [0, 1, 3, 5, 4, 2],
  "totalDistance": 63,
  "iterations": 2
}
```

Visiting `[0, 1, 3, 5, 4, 2]` and returning to `0` covers all 6 cities once with total distance $3 + 24 + 3 + 5 + 24 + 4 =$ **63** after **2** DFJ cut iterations.
