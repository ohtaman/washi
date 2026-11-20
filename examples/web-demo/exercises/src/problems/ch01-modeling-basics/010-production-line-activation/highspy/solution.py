import pulp


def solve(input_data: dict) -> dict:
    """Return {"open": list[int], "quantities": list[float], "netProfit": float}."""
    margins = input_data["margins"]
    fixed_costs = input_data["fixedCosts"]
    capacities = input_data["capacities"]
    mat_usages = input_data["materialUsages"]
    mat_cap = input_data["materialCap"]
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
