# #088. Linearized CVaR Portfolio Optimization

<!-- section:scenario -->
An asset manager allocates capital across several assets—such as equities, corporate bonds, and treasury bills—whose weights must be non-negative, bounded individually below a maximum concentration cap, and sum to one. Under a discrete set of return scenarios with known probabilities, the portfolio loss in each scenario equals the negative portfolio return.

To control severe tail losses without non-linear optimization, measure Conditional Value-at-Risk (CVaR)—the average of the worst $1 - \alpha$ tail losses at confidence level $\alpha$—via the linear Rockafellar-Uryasev formulation, and return the portfolio weights, auxiliary VaR threshold, and CVaR. Choose portfolio weights to **minimize expected loss plus risk weight times CVaR**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `returns` | `number[][]` | Asset return matrix indexed by [scenario][asset] |
| `probs` | `number[]` | Occurrence probability of each scenario (sums to 1) |
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

For weights `[0, 0.3, 0.7]`, scenario returns are `[0.019, 0.029, 0.015, -0.032]`, yielding expected loss -0.00775 and worst-25% tail loss 0.032, so $-0.00775 + 2.0 \times 0.032 =$ **0.05625**.


<!-- section:hint1 -->
Introduce portfolio weights bounded between zero and the concentration cap that sum to one, together with one scalar auxiliary VaR threshold variable and one non-negative tail-excess variable per scenario. Each scenario's tail-excess variable captures how much the portfolio loss exceeds the VaR threshold in that scenario.

<!-- section:hint2 -->
The main pitfall is constraining the VaR threshold $\eta$ to be non-negative: WaSHI's `m.continuous` defaults `lb` to 0, so you must pass `{ lb: -Infinity, ub: Infinity }`, whereas PuLP's `pulp.LpVariable` defaults `lowBound` to `None` (do not copy `lowBound=0` onto `eta`; writing `lowBound=None` explicitly makes the intent clear), because when all scenario returns are positive the optimal VaR threshold is negative. Use Rockafellar-Uryasev's hinge inequalities so each scenario's non-negative excess variable bounds the shortfall of portfolio loss above $\eta$, and weight CVaR against expected loss using `riskWeight`.