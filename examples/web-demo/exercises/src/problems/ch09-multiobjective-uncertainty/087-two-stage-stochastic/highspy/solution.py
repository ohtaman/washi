import pulp


def solve(
    orderCosts,
    shortageCosts,
    salvageValues,
    warehouseCap,
    probs,
    demands,
) -> dict:
    """Return {"orders": list[float], "expectedCost": float}."""
    order_costs = orderCosts
    shortage_costs = shortageCosts
    salvage_values = salvageValues
    warehouse_cap = warehouseCap
    n = len(order_costs)
    S = len(probs)

    prob = pulp.LpProblem("two_stage_stochastic", pulp.LpMinimize)
    orders = [pulp.LpVariable(f"x_{j}", lowBound=0) for j in range(n)]
    shortage = [
        [pulp.LpVariable(f"short_{s}_{j}", lowBound=0) for j in range(n)]
        for s in range(S)
    ]
    leftover = [
        [pulp.LpVariable(f"left_{s}_{j}", lowBound=0) for j in range(n)]
        for s in range(S)
    ]

    prob += pulp.lpSum(orders) <= warehouse_cap
    for s in range(S):
        for j in range(n):
            prob += orders[j] + shortage[s][j] - leftover[s][j] == demands[s][j]

    stage2_expected = pulp.lpSum(
        probs[s] * (pulp.lpDot(shortage_costs, shortage[s]) - pulp.lpDot(salvage_values, leftover[s]))
        for s in range(S)
    )
    prob += pulp.lpDot(order_costs, orders) + stage2_expected
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "orders": [float(pulp.value(v)) for v in orders],
        "expectedCost": float(pulp.value(prob.objective)),
    }
