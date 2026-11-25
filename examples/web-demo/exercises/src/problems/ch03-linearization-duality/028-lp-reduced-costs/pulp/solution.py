import pulp


def solve(costs, yields, min_requirements) -> dict:
    """Return {"quantities": list[float], "reduced_costs": list[float], "optimal_cost": float}."""
    min_reqs = min_requirements
    n = len(costs)

    prob = pulp.LpProblem("reduced_costs", pulp.LpMinimize)

    # Decision variables: continuous non-negative activity levels quantities[j] >= 0.
    quantities = [pulp.LpVariable(f"x_{j}", lowBound=0) for j in range(n)]

    # Minimum requirement constraints for each output k.
    for k, req in enumerate(min_reqs):
        prob += pulp.lpDot(yields[k], quantities) >= req

    # Objective: minimize total cost.
    prob += pulp.lpDot(costs, quantities)
    prob.solve(pulp.HiGHS(msg=False))

    # Clamp near-zero reduced costs (v.dj < 1e-9) to 0.0 to avoid -0.0 or solver noise.
    return {
        "quantities": [float(pulp.value(v)) for v in quantities],
        "reduced_costs": [0.0 if abs(v.dj) < 1e-9 else float(v.dj) for v in quantities],
        "optimal_cost": float(pulp.value(prob.objective)),
    }
