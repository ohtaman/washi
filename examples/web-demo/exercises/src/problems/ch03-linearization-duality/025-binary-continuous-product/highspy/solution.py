import pulp


def solve(
    minOrders,
    maxOrders,
    baseCosts,
    discounts,
    contractFees,
    totalDemand,
) -> dict:
    """Return {"b": list[int], "x": list[float], "z": list[float], "totalCost": float}."""
    min_ord = minOrders
    max_ord = maxOrders
    base_costs = baseCosts
    fees = contractFees
    demand = totalDemand
    n = len(min_ord)

    prob = pulp.LpProblem("glover_product", pulp.LpMinimize)

    b = [pulp.LpVariable(f"b_{i}", cat=pulp.LpBinary) for i in range(n)]
    x = [
        pulp.LpVariable(f"x_{i}", lowBound=float(min_ord[i]), upBound=float(max_ord[i]))
        for i in range(n)
    ]
    z = [
        pulp.LpVariable(f"z_{i}", lowBound=0, upBound=float(max_ord[i]))
        for i in range(n)
    ]

    prob += pulp.lpSum(x) >= demand
    for i in range(n):
        L, U = min_ord[i], max_ord[i]
        prob += z[i] >= L * b[i]
        prob += z[i] <= U * b[i]
        prob += z[i] >= x[i] - U * (1 - b[i])
        prob += z[i] <= x[i] - L * (1 - b[i])

    prob += pulp.lpDot(base_costs, x) + pulp.lpDot(fees, b) - pulp.lpDot(discounts, z)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "b": [round(pulp.value(v)) for v in b],
        "x": [float(pulp.value(v)) for v in x],
        "z": [float(pulp.value(v)) for v in z],
        "totalCost": float(pulp.value(prob.objective)),
    }
