# #038. VM Host Packing & Symmetry Breaking

<!-- section:scenario -->
A cloud cluster has numHosts identical physical hosts, each with memory capacity. We must place n virtual machines where VM i consumes sizes[i] capacity on its assigned host.

Each anti-affinity pair [u, v] in conflicts cannot run on the same host, and no host's total assigned VM size may exceed capacity. Assign each VM to a host index in 0 to numHosts - 1 to minimize the total number of active hosts.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numHosts` | `number` | Number of identical physical hosts (`0` to `numHosts - 1`) |
| `capacity` | `number` | Uniform resource capacity of each host |
| `sizes` | `number[]` | Positive integer resource requirement of each VM |
| `conflicts` | `number[][]` | Anti-affinity pairs `[u, v]` forbidding `hosts[u] == hosts[v]` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `hosts` | `number[]` | Assigned host index (`0` to `numHosts - 1`) for each VM |
| `usedHosts` | `number` | Minimized count of active (non-empty) hosts |

<!-- section:example -->
**Input**

```json
{
  "numHosts": 4,
  "capacity": 10,
  "sizes": [4, 4, 7, 3],
  "conflicts": [
    [0, 1]
  ]
}
```

**Output**

```json
{
  "hosts": [2, 0, 1, 0],
  "usedHosts": 3
}
```

Host 0 runs VMs `{1, 3}` (load $4 + 3 = 7 \le 10$), Host 1 runs VM `{2}` (load $7 \le 10$), and Host 2 runs VM `{0}` (load $4 \le 10$), separating conflicting pair `(0, 1)` across **3** active hosts.
