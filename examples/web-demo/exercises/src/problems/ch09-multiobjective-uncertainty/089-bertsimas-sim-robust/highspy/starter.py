import pulp


def solve(input_data: dict) -> dict:
    """Return {"quantities": list[float], "totalProfit": float}."""
    profits = input_data["profits"]
    nominal = input_data["nominalUsages"]
    deviations = input_data["deviations"]
    max_units = input_data["maxUnits"]
    cap = input_data["capacityCap"]
    gamma = input_data["gamma"]
    n = len(profits)

    prob = pulp.LpProblem("bertsimas_sim_robust", pulp.LpMaximize)
    x = [pulp.LpVariable(f"x_{j}", lowBound=0, upBound=max_units[j]) for j in range(n)]
    z = pulp.LpVariable("z", lowBound=0)
    p = [pulp.LpVariable(f"p_{j}", lowBound=0) for j in range(n)]

    # TODO:
    # 1. Add dual inequalities z + p[j] >= deviations[j] * x[j]
    # 2. Add protected capacity constraint lpDot(nominal, x) + gamma * z + lpSum(p) <= cap
    # 3. Maximize lpDot(profits, x), solve with HiGHS, and return {"quantities": ..., "totalProfit": ...}
    raise NotImplementedError("Not implemented")
