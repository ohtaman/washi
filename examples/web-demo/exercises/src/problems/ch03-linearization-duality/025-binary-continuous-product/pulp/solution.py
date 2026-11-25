import pulp


def solve(
    min_orders,
    max_orders,
    base_costs,
    discounts,
    contract_fees,
    total_demand,
) -> dict:
    """Return {"b": list[int], "x": list[float], "z": list[float], "total_cost": float}."""
    min_ord = min_orders
    max_ord = max_orders
    fees = contract_fees
    demand = total_demand
    n = len(min_ord)

    prob = pulp.LpProblem("glover_product", pulp.LpMinimize)

    # Decision variables: binary b[i] (discount contract active), continuous x[i] in [min_ord[i], max_ord[i]],
    # and auxiliary continuous z[i] in [0, max_ord[i]] representing the bilinear product b[i] * x[i].
    b = [pulp.LpVariable(f"b_{i}", cat=pulp.LpBinary) for i in range(n)]
    x = [
        pulp.LpVariable(f"x_{i}", lowBound=float(min_ord[i]), upBound=float(max_ord[i]))
        for i in range(n)
    ]
    z = [
        pulp.LpVariable(f"z_{i}", lowBound=0, upBound=float(max_ord[i]))
        for i in range(n)
    ]

    # Total order quantity must meet demand; Glover's linearization enforces z_i = b_i * x_i.
    prob += pulp.lpSum(x) >= demand
    for i in range(n):
        L, U = min_ord[i], max_ord[i]
        prob += z[i] >= L * b[i]
        prob += z[i] <= U * b[i]
        prob += z[i] >= x[i] - U * (1 - b[i])
        prob += z[i] <= x[i] - L * (1 - b[i])

    # Objective: minimize base procurement costs plus contract fees minus linearized volume discounts.
    prob += pulp.lpDot(base_costs, x) + pulp.lpDot(fees, b) - pulp.lpDot(discounts, z)
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to exact integers to remove floating-point tolerance noise.
    return {
        "b": [round(pulp.value(v)) for v in b],
        "x": [float(pulp.value(v)) for v in x],
        "z": [float(pulp.value(v)) for v in z],
        "total_cost": float(pulp.value(prob.objective)),
    }
