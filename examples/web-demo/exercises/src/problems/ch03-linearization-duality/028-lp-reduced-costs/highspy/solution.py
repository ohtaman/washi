import pulp


def solve(costs, yields, min_requirements) -> dict:
    """Return {"quantities": list[float], "reducedCosts": list[float], "optimalCost": float}."""
    min_reqs = min_requirements
    n = len(costs)

    prob = pulp.LpProblem("reduced_costs", pulp.LpMinimize)

    quantities = [pulp.LpVariable(f"x_{j}", lowBound=0) for j in range(n)]

    for k, req in enumerate(min_reqs):
        prob += pulp.lpDot(yields[k], quantities) >= req

    prob += pulp.lpDot(costs, quantities)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "quantities": [float(pulp.value(v)) for v in quantities],
        "reducedCosts": [0.0 if abs(v.dj) < 1e-9 else float(v.dj) for v in quantities],
        "optimalCost": float(pulp.value(prob.objective)),
    }
