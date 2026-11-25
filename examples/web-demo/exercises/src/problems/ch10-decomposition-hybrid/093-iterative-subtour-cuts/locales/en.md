# #093. Iterative Subtour Elimination Cuts (DFJ TSP)

<!-- section:scenario -->
Given a symmetric distance matrix over $n$ delivery hubs (cities), find a shortest closed Hamiltonian tour visiting every city exactly once using an iterative Dantzig-Fulkerson-Johnson (DFJ) subtour elimination loop. Starting from a 2-matching relaxation that only requires each city to have degree 2, iteratively separate any disconnected subtours until a single connected tour remains.

Return the optimal tour, its total distance, and the number of MIP solves executed.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `distances` | `number[][]` | Symmetric $n \times n$ pairwise distance matrix ($5 \le n \le 8$) |

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

Visiting `[0, 1, 3, 5, 4, 2]` and returning to 0 covers all 6 cities once with total distance $3 + 24 + 3 + 5 + 24 + 4 =$ **63** after **2** DFJ cut iterations.

<!-- section:hint1 -->
Model one binary edge-selection decision per unordered pair of distinct cities, minimizing total tour distance. Structure the solver as an iterative cutting-plane loop that starts from a relaxed degree-constrained model and progressively cuts off disconnected cycles until a single connected tour remains.

<!-- section:hint2 -->
Index undirected edges by pairs $(i, j)$ with $i < j$ and enforce degree 2 at every city. Because every vertex has degree 2, any disconnected integer solution decomposes into vertex-disjoint cycles $S$; for each proper subset $S$ with $|S| < n$, add the DFJ cut $\sum_{i, j \in S,\, i < j} x_{ij} \le |S| - 1$ to the same model, re-solve, and increment `iterations` on each `solve()` call.
