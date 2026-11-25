import pulp


def solve(margins, fixed_costs, capacities, material_usages, material_cap) -> dict:
    """Return {"open": list[int], "quantities": list[float], "net_profit": float}."""
    mat_usages = material_usages
    mat_cap = material_cap
    n = len(margins)

    prob = pulp.LpProblem("line_activation", pulp.LpMaximize)

    # Decision variables: binary line activation open_vars[i] and continuous production quantities[i] >= 0.
    open_vars = [pulp.LpVariable(f"open_{i}", cat=pulp.LpBinary) for i in range(n)]
    quantities = [pulp.LpVariable(f"qty_{i}", lowBound=0) for i in range(n)]

    # Big-M linking constraints: production on line i is allowed up to capacities[i] only when open_vars[i] = 1.
    for i in range(n):
        prob += quantities[i] <= capacities[i] * open_vars[i]
    # Shared raw material limit across all lines.
    prob += pulp.lpDot(mat_usages, quantities) <= mat_cap

    # Objective: maximize net profit (unit margins minus fixed activation costs).
    prob += pulp.lpDot(margins, quantities) - pulp.lpDot(fixed_costs, open_vars)
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to exact integers to remove floating-point tolerance noise.
    return {
        "open": [round(pulp.value(v)) for v in open_vars],
        "quantities": [float(pulp.value(v)) for v in quantities],
        "net_profit": float(pulp.value(prob.objective)),
    }
