import pulp


def solve(
    costs,
    capacities,
    yields,
    min_requirements,
    resource_usages,
    max_resources,
) -> dict:
    """Return {"quantities": list[float], "duals": list[float], "optimal_cost": float}."""
    min_reqs = min_requirements
    usages = resource_usages
    max_res = max_resources
    n = len(costs)

    prob = pulp.LpProblem("shadow_prices", pulp.LpMinimize)

    quantities = [
        pulp.LpVariable(f"x_{i}", lowBound=0, upBound=float(capacities[i]))
        for i in range(n)
    ]

    req_constrs = [pulp.lpDot(yields[k], quantities) >= req for k, req in enumerate(min_reqs)]
    cap_constrs = [pulp.lpDot(usages[l], quantities) <= cap for l, cap in enumerate(max_res)]
    for con in req_constrs + cap_constrs:
        prob += con

    prob += pulp.lpDot(costs, quantities)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "quantities": [float(pulp.value(v)) for v in quantities],
        "duals": [0.0 if abs(c.pi) < 1e-9 else float(c.pi) for c in req_constrs + cap_constrs],
        "optimal_cost": float(pulp.value(prob.objective)),
    }
