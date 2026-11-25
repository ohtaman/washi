# #065. Multi-Echelon Supply Chain Design

<!-- section:scenario -->
A beverage company must design a two-echelon distribution network consisting of candidate bottling plants, candidate regional distribution centers (DCs), and retail customer zones. Opening a plant or a DC incurs a one-time fixed facility cost and unlocks non-negative continuous shipments up to its capacity limit; closed facilities cannot send or handle any flow.

Each DC acts strictly as a transshipment node whose total inbound flow from plants equals its total outbound flow to customers, and every customer's demand must be met. Choose which plants and DCs to open and the non-negative continuous shipment quantities along every echelon link to **minimize total fixed plus shipping costs**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `plantFixedCosts` | `number[]` | Fixed opening cost per candidate plant (length $P$) |
| `plantCaps` | `number[]` | Maximum supply capacity per candidate plant (length $P$) |
| `dcFixedCosts` | `number[]` | Fixed opening cost per candidate DC (length $D$) |
| `dcCaps` | `number[]` | Maximum throughput capacity per candidate DC (length $D$) |
| `demands` | `number[]` | Demand per customer zone (length $C$) |
| `plantDcCosts` | `number[][]` | Unit shipping cost from each plant to each DC ($P \times D$) |
| `dcCustomerCosts` | `number[][]` | Unit shipping cost from each DC to each customer ($D \times C$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `openPlants` | `number[]` | Binary (0 or 1) plant opening decisions (length $P$) |
| `openDcs` | `number[]` | Binary (0 or 1) DC opening decisions (length $D$) |
| `plantToDc` | `number[][]` | Non-negative continuous shipment matrix ($P \times D$) |
| `dcToCustomer` | `number[][]` | Non-negative continuous shipment matrix ($D \times C$) |
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

Opening both plants and DCs 0 and 2 satisfies all capacities, DC flow balance (70 = 30 + 40, 60 = 35 + 25), and demands at total cost $1450 + 460 + 445 =$ **2,355** (fixed 1450, plant-to-DC 460, DC-to-customer 445).


<!-- section:hint1 -->
Introduce binary opening decisions for each candidate plant and each candidate DC, along with continuous non-negative shipment matrices from plants to DCs and from DCs to customers. The network consists of two coupled echelons linked through the distribution centers.

<!-- section:hint2 -->
Bound each plant's total outbound flow by its capacity times its binary opening variable, and similarly bound each DC's total throughput by its capacity times its DC opening variable. Every DC must also satisfy strict flow conservation (total inflow from plants equals total outflow to customers), while every customer's total inflow must meet its demand.
