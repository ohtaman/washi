import pulp


def solve(input_data: dict) -> dict:
    """Return {"committed": list[int], "recovered": list[list[int]], "totalCost": float}."""
    fixed_costs = input_data["fixedCosts"]
    capacities = input_data["capacities"]
    drop_amounts = input_data["dropAmounts"]
    gamma = input_data["gamma"]
    robust_min_cap = input_data["robustMinCap"]
    probs = input_data["probs"]
    demands = input_data["demands"]
    offline = input_data["offline"]
    disruption_cost = input_data["disruptionCost"]
    shortfall_pen = input_data["shortfallPenalty"]
    n = len(fixed_costs)
    S = len(probs)

    prob = pulp.LpProblem("resilient_planning_synthesis", pulp.LpMinimize)
    y = [pulp.LpVariable(f"y_{j}", cat=pulp.LpBinary) for j in range(n)]
    z = pulp.LpVariable("z", lowBound=0)
    p = [pulp.LpVariable(f"p_{j}", lowBound=0) for j in range(n)]
    w = [[pulp.LpVariable(f"w_{s}_{j}", cat=pulp.LpBinary) for j in range(n)] for s in range(S)]
    diff = [[pulp.LpVariable(f"d_{s}_{j}", lowBound=0, upBound=1) for j in range(n)] for s in range(S)]
    shortfall = [pulp.LpVariable(f"u_{s}", lowBound=0) for s in range(S)]

    # TODO:
    # 1. Add Bertsimas-Sim robust capacity guarantee on y using z and p
    # 2. For each scenario s, enforce offline outages, elastic demand cover, and Hamming diff linearization
    # 3. Minimize fixed cost + expected disruption and shortfall cost, solve with HiGHS,
    #    and return {"committed": ..., "recovered": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
