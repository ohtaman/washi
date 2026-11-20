import pulp


def solve(input_data: dict) -> dict:
    """Return {"quantities": list[float], "duals": list[float], "optimalCost": float}."""
    costs = input_data["costs"]
    capacities = input_data["capacities"]
    yields = input_data["yields"]
    min_reqs = input_data["minRequirements"]
    usages = input_data["resourceUsages"]
    max_res = input_data["maxResources"]
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
        "optimalCost": float(pulp.value(prob.objective)),
    }
