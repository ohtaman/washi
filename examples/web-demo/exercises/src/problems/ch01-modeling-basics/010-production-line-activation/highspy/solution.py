import pulp


def solve(margins, fixed_costs, capacities, material_usages, material_cap) -> dict:
    """Return {"open": list[int], "quantities": list[float], "netProfit": float}."""
    mat_usages = material_usages
    mat_cap = material_cap
    n = len(margins)

    prob = pulp.LpProblem("line_activation", pulp.LpMaximize)

    open_vars = [pulp.LpVariable(f"open_{i}", cat=pulp.LpBinary) for i in range(n)]
    quantities = [pulp.LpVariable(f"qty_{i}", lowBound=0) for i in range(n)]

    for i in range(n):
        prob += quantities[i] <= capacities[i] * open_vars[i]
    prob += pulp.lpDot(mat_usages, quantities) <= mat_cap

    prob += pulp.lpDot(margins, quantities) - pulp.lpDot(fixed_costs, open_vars)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "open": [round(pulp.value(v)) for v in open_vars],
        "quantities": [float(pulp.value(v)) for v in quantities],
        "netProfit": float(pulp.value(prob.objective)),
    }
