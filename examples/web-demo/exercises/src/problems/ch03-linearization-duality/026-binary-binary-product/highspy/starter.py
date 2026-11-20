import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "pairProducts": list[int], "totalValue": float}."""
    values = input_data["values"]
    costs = input_data["costs"]
    budget = input_data["budget"]
    pairs = input_data["pairs"]
    n = len(values)
    P = len(pairs)

    prob = pulp.LpProblem("binary_binary_product", pulp.LpMaximize)

    selected = [pulp.LpVariable(f"x_{i}", cat=pulp.LpBinary) for i in range(n)]
    pair_products = [pulp.LpVariable(f"w_{k}", lowBound=0, upBound=1) for k in range(P)]

    # TODO:
    # 1. Add budget constraint: lpDot(costs, selected) <= budget
    # 2. Enforce exact McCormick bounds for w[k] = x[i] * x[j] on each pair [i, j, s]
    # 3. Maximize standalone values + pair synergies,
    #    call prob.solve(pulp.HiGHS(msg=False)), and return {"selected": ..., "pairProducts": ..., "totalValue": ...}
    raise NotImplementedError("Not implemented")
