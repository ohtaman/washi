# #065. Multi-Echelon Supply Chain Design

<!-- section:scenario -->
A company must design a two-echelon distribution network consisting of candidate manufacturing plants, candidate distribution centers (DCs), and customer zones. Opening a plant or a DC incurs a one-time fixed facility cost and unlocks shipments up to its capacity limit; closed facilities cannot send or handle any flow.

Each DC acts strictly as a transshipment node whose total inbound flow from plants equals its total outbound flow to customers, and every customer's demand must be fully met. Choose which plants and DCs to open and how much to ship along every echelon link to **minimize total fixed plus shipping costs**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `plantFixedCosts` | `number[]` | Fixed opening cost $F^P_p$ for plant $p$ |
| `plantCaps` | `number[]` | Maximum supply capacity $C^P_p$ of plant $p$ |
| `dcFixedCosts` | `number[]` | Fixed opening cost $F^D_d$ for DC $d$ |
| `dcCaps` | `number[]` | Maximum throughput capacity $C^D_d$ of DC $d$ |
| `demands` | `number[]` | Demand $D_c$ at customer $c$ |
| `plantDcCosts` | `number[][]` | Unit shipping cost $c_{p,d}$ from plant $p$ to DC $d$ |
| `dcCustomerCosts` | `number[][]` | Unit shipping cost $c'_{d,c}$ from DC $d$ to customer $c$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `openPlants` | `number[]` | Binary (`0` or `1`) plant opening decisions |
| `openDcs` | `number[]` | Binary (`0` or `1`) DC opening decisions |
| `plantToDc` | `number[][]` | Non-negative shipment matrix ($P \times D$) |
| `dcToCustomer` | `number[][]` | Non-negative shipment matrix ($D \times C$) |
| `totalCost` | `number` | Minimized sum of fixed facility costs and shipping costs |

<!-- section:example -->
**Input**

```json
{
  "plantFixedCosts": [500, 420],
  "plantCaps": [120, 100],
  "dcFixedCosts": [250, 200, 280],
  "dcCaps": [90, 80, 100],
  "demands": [30, 40, 35, 25],
  "plantDcCosts": [
    [4, 6, 8],
    [7, 5, 3]
  ],
  "dcCustomerCosts": [
    [3, 5, 9, 7],
    [6, 2, 4, 8],
    [8, 7, 3, 2]
  ]
}
```

**Output**

```json
{
  "openPlants": [1, 1],
  "openDcs": [1, 0, 1],
  "plantToDc": [
    [70, 0, 0],
    [0, 0, 60]
  ],
  "dcToCustomer": [
    [30, 40, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 35, 25]
  ],
  "totalCost": 2355
}
```

Opening both plants and DCs 0 and 2 satisfies all capacities, DC flow balance (`70 == 30+40`, `60 == 35+25`), and demands at total cost $1450 + 460 + 445 =$ **2,355**.
