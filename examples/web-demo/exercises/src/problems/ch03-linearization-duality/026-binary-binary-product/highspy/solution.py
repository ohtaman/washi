import pulp


def solve(values, costs, budget, pairs) -> dict:
    """Return {"selected": list[int], "pairProducts": list[int], "totalValue": float}."""
    n = len(values)
    P = len(pairs)

    prob = pulp.LpProblem("binary_binary_product", pulp.LpMaximize)

    selected = [pulp.LpVariable(f"x_{i}", cat=pulp.LpBinary) for i in range(n)]
    pair_products = [pulp.LpVariable(f"w_{k}", lowBound=0, upBound=1) for k in range(P)]

    prob += pulp.lpDot(costs, selected) <= budget
    for k, (i, j, _) in enumerate(pairs):
        prob += pair_products[k] <= selected[i]
        prob += pair_products[k] <= selected[j]
        prob += pair_products[k] >= selected[i] + selected[j] - 1

    synergies = [s for _, _, s in pairs]
    prob += pulp.lpDot(values, selected) + pulp.lpDot(synergies, pair_products)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "pairProducts": [round(pulp.value(v)) for v in pair_products],
        "totalValue": float(pulp.value(prob.objective)),
    }
