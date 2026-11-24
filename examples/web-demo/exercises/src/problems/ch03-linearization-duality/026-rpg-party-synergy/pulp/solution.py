import pulp


def solve(power, costs, budget, max_party_size, pairs) -> dict:
    """Return {"selected": list[int], "pair_products": list[int], "total_value": float}."""
    n = len(power)
    P = len(pairs)

    prob = pulp.LpProblem("rpg_party_synergy", pulp.LpMaximize)

    # Decision variables: binary selected[i] (hero i recruited) and continuous pair_products[k] in [0, 1]
    # representing selected[i] * selected[j] (forced to {0, 1} by binary selected and McCormick bounds).
    selected = [pulp.LpVariable(f"x_{i}", cat=pulp.LpBinary) for i in range(n)]
    pair_products = [pulp.LpVariable(f"w_{k}", lowBound=0, upBound=1) for k in range(P)]

    # Budget, party size, and Fortet/McCormick linearization of w_k = x_i * x_j.
    prob += pulp.lpDot(costs, selected) <= budget
    prob += pulp.lpSum(selected) <= max_party_size
    for k, (i, j, _) in enumerate(pairs):
        prob += pair_products[k] <= selected[i]
        prob += pair_products[k] <= selected[j]
        prob += pair_products[k] >= selected[i] + selected[j] - 1

    # Objective: maximize individual hero power plus pairwise synergy bonuses.
    bonuses = [s for _, _, s in pairs]
    prob += pulp.lpDot(power, selected) + pulp.lpDot(bonuses, pair_products)
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary/linearized indicators to exact integers to remove floating-point tolerance noise.
    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "pair_products": [round(pulp.value(v)) for v in pair_products],
        "total_value": float(pulp.value(prob.objective)),
    }
