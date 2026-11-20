import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "pairProducts": list[int], "peakLoad": float, "totalCost": float}."""
    base_costs = input_data["baseCosts"]
    values = input_data["values"]
    min_value = input_data["minValue"]
    loads = input_data["loads"]
    targets = input_data["targets"]
    dev_weights = input_data["devWeights"]
    peak_weight = input_data["peakWeight"]
    pairs = input_data["pairs"]
    n = len(base_costs)
    m_zones = len(loads)
    P = len(pairs)

    prob = pulp.LpProblem("linearization_synthesis", pulp.LpMinimize)

    selected = [pulp.LpVariable(f"x_{i}", cat=pulp.LpBinary) for i in range(n)]
    pair_products = [pulp.LpVariable(f"w_{k}", lowBound=0, upBound=1) for k in range(P)]
    peak_load = pulp.LpVariable("peak", lowBound=0)
    d_plus = [pulp.LpVariable(f"dp_{r}", lowBound=0) for r in range(m_zones)]
    d_minus = [pulp.LpVariable(f"dm_{r}", lowBound=0) for r in range(m_zones)]

    # TODO:
    # 1. Enforce minimum value: lpDot(values, selected) >= min_value
    # 2. Enforce minimax peak caps and L1 deviation splits for each zone r
    # 3. Enforce McCormick inequalities for w[k] = selected[i] * selected[j]
    # 4. Minimize total cost, call prob.solve(pulp.HiGHS(msg=False)),
    #    and return {"selected": ..., "pairProducts": ..., "peakLoad": ..., "totalCost": ...}
    raise NotImplementedError("Not implemented")
