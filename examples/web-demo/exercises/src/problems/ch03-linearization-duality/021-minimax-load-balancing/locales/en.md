# #021. Minimax Server Load Balancing

<!-- section:scenario -->
A cluster operator is planning how to distribute splittable batch jobs—each with a given workload (in load units)—across servers in a distributed compute cluster. Each job can only be assigned to servers marked as compatible, and the assignment fraction for any incompatible server must be 0.

Using epigraph linearization (bounding the maximum load from above with a single upper-bound variable and minimizing that variable), find the assignment fractions that process 100% (fraction 1) of every job while **minimizing the load on the busiest server (peak load)**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `weights` | `number[]` | Total workload of each job $i$ (load units) |
| `compatible` | `number[][]` | `1` if job $i$ can be assigned to server $j$, `0` otherwise |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignments` | `number[][]` | Fraction of job $i$ assigned to server $j$ (`[0, 1]`) |
| `peakLoad` | `number` | Minimized maximum workload across all servers |

<!-- section:example -->
**Input**

```json
{
  "weights": [10, 8, 6],
  "compatible": [
    [1, 0],
    [1, 1],
    [0, 1]
  ]
}
```

**Output**

```json
{
  "assignments": [
    [1, 0],
    [0.25, 0.75],
    [0, 1]
  ],
  "peakLoad": 12
}
```

Job 0 goes entirely to Server 0, Job 2 goes entirely to Server 1, and splitting Job 1 as 0.25 / 0.75 yields Server 0 load $10 + 8 \times 0.25 = 12$ and Server 1 load $8 \times 0.75 + 6 = 12$, giving a peak load of **12**.


<!-- section:hint1 -->
Create a continuous matrix of assignment fractions indexed by job and server, with each entry bounded between zero and the corresponding compatibility flag so incompatible pairs are automatically zeroed out. Introduce one additional continuous scalar variable to represent the worst-case server load across the cluster.

<!-- section:hint2 -->
To linearize minimizing a maximum over servers without a nonlinear `max` operator, use an epigraph reformulation: bound every server's weighted load by the auxiliary peak scalar and minimize that scalar directly. Minimization pushes the peak down until at least one server's bound is tight, so the scalar equals the true maximum load at optimality.