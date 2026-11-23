import pulp


def solve(profits, nominal_usages, deviations, max_units, capacity_cap, gamma) -> dict:
    """Return {"quantities": list[float], "totalProfit": float}."""
    nominal = nominal_usages
    cap = capacity_cap
    n = len(profits)

    prob = pulp.LpProblem("bertsimas_sim_robust", pulp.LpMaximize)
    x = [pulp.LpVariable(f"x_{j}", lowBound=0, upBound=max_units[j]) for j in range(n)]
    z = pulp.LpVariable("z", lowBound=0)
    p = [pulp.LpVariable(f"p_{j}", lowBound=0) for j in range(n)]

    for j in range(n):
        prob += z + p[j] >= deviations[j] * x[j]
    prob += pulp.lpDot(nominal, x) + gamma * z + pulp.lpSum(p) <= cap

    prob += pulp.lpDot(profits, x)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "quantities": [float(pulp.value(v)) for v in x],
        "totalProfit": float(pulp.value(prob.objective)),
    }
