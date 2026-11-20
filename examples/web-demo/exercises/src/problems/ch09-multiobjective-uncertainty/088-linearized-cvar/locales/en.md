# #088. Linearized CVaR Portfolio Optimization

<!-- section:scenario -->
An asset manager allocates capital across several assets whose weights must be non-negative, bounded individually below a maximum concentration cap, and sum to one. Under a discrete set of return scenarios with known probabilities, the portfolio loss in each scenario equals the negative portfolio return.

To control severe tail losses without non-linear optimization, adopt the Rockafellar-Uryasev formulation of Conditional Value-at-Risk at confidence level alpha using a free Value-at-Risk threshold variable and non-negative tail excess variables. Choose portfolio weights to **minimize expected loss plus risk weight times CVaR**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `returns` | `number[][]` | Scenario asset return matrix ($S \times n$) |
| `probs` | `number[]` | Probability weight $p_s$ for each scenario $s$ |
| `alpha` | `number` | Confidence level $\alpha \in (0, 1)$ defining the tail fraction $1 - \alpha$ |
| `riskWeight` | `number` | Penalty multiplier $\lambda$ on $\text{CVaR}_\alpha$ |
| `maxWeight` | `number` | Maximum weight allowed in any single asset |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `weights` | `number[]` | Portfolio allocation weights summing to 1 |
| `varThreshold` | `number` | Optimal auxiliary VaR threshold $\eta$ |
| `cvar` | `number` | Optimal Conditional Value-at-Risk $\text{CVaR}_\alpha$ of portfolio loss |
| `totalObjective` | `number` | Minimized expected loss plus $\lambda \cdot \text{CVaR}_\alpha$ |

<!-- section:example -->
**Input**

```json
{
  "returns": [
    [0.14, 0.04, 0.01],
    [-0.12, 0.05, 0.02],
    [0.18, -0.02, 0.03],
    [-0.18, -0.06, -0.02]
  ],
  "probs": [0.25, 0.25, 0.25, 0.25],
  "alpha": 0.75,
  "riskWeight": 2.0,
  "maxWeight": 0.7
}
```

**Output**

```json
{
  "weights": [0, 0.3, 0.7],
  "varThreshold": 0.032,
  "cvar": 0.032,
  "totalObjective": 0.05625
}
```

For `weights = [0, 0.3, 0.7]`, scenario returns are `[0.019, 0.029, 0.015, -0.032]`, yielding expected loss `-0.00775` and worst-25% tail loss `0.032`, so $-0.00775 + 2.0 \times 0.032 =$ **0.05625**.
