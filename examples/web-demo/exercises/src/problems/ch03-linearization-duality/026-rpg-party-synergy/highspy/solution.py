import pulp


def solve(power, costs, budget, max_party_size, pairs) -> dict:
    """Return {"selected": list[int], "pairProducts": list[int], "totalValue": float}."""
    n = len(power)
    P = len(pairs)

    prob = pulp.LpProblem("rpg_party_synergy", pulp.LpMaximize)

    selected = [pulp.LpVariable(f"x_{i}", cat=pulp.LpBinary) for i in range(n)]
    pair_products = [pulp.LpVariable(f"w_{k}", lowBound=0, upBound=1) for k in range(P)]

    prob += pulp.lpDot(costs, selected) <= budget
    prob += pulp.lpSum(selected) <= max_party_size
    for k, (i, j, _) in enumerate(pairs):
        prob += pair_products[k] <= selected[i]
        prob += pair_products[k] <= selected[j]
        prob += pair_products[k] >= selected[i] + selected[j] - 1

    bonuses = [s for _, _, s in pairs]
    prob += pulp.lpDot(power, selected) + pulp.lpDot(bonuses, pair_products)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "pairProducts": [round(pulp.value(v)) for v in pair_products],
        "totalValue": float(pulp.value(prob.objective)),
    }
