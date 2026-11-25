import pulp


def solve(
    base_costs,
    values,
    min_value,
    loads,
    targets,
    dev_weights,
    peak_weight,
    pairs,
) -> dict:
    """Return {"selected": list[int], "pair_products": list[int], "peak_load": float, "total_cost": float}."""
    n = len(base_costs)
    m_zones = len(loads)
    P = len(pairs)

    prob = pulp.LpProblem("linearization_synthesis", pulp.LpMinimize)

    # Decision variables:
    # - selected[i]: binary indicator for selecting item i
    # - pair_products[k]: continuous in [0, 1] representing x_i * x_j (forced to {0, 1} by binary selected)
    # - peak_load >= 0: epigraph variable for minimax zone load
    # - d_plus[r], d_minus[r] >= 0: positive/negative deviations from zone target[r] for L1 penalty
    selected = [pulp.LpVariable(f"x_{i}", cat=pulp.LpBinary) for i in range(n)]
    pair_products = [pulp.LpVariable(f"w_{k}", lowBound=0, upBound=1) for k in range(P)]
    peak_load = pulp.LpVariable("peak", lowBound=0)
    d_plus = [pulp.LpVariable(f"dp_{r}", lowBound=0) for r in range(m_zones)]
    d_minus = [pulp.LpVariable(f"dm_{r}", lowBound=0) for r in range(m_zones)]

    # Minimum total value requirement, plus minimax peak load and L1 deviation split per zone.
    prob += pulp.lpDot(values, selected) >= min_value
    for r in range(m_zones):
        zone_load = pulp.lpDot(loads[r], selected)
        prob += zone_load <= peak_load
        prob += zone_load - targets[r] == d_plus[r] - d_minus[r]

    # Fortet/McCormick linearization of w_k = x_i * x_j (handles both positive and negative pair costs).
    for k, (i, j, _) in enumerate(pairs):
        prob += pair_products[k] <= selected[i]
        prob += pair_products[k] <= selected[j]
        prob += pair_products[k] >= selected[i] + selected[j] - 1

    # Objective: minimize base costs + pairwise interaction costs + weighted peak load + weighted L1 deviations.
    pair_costs = [s for _, _, s in pairs]
    prob += (
        pulp.lpDot(base_costs, selected)
        + pulp.lpDot(pair_costs, pair_products)
        + peak_weight * peak_load
        + pulp.lpDot(dev_weights, d_plus)
        + pulp.lpDot(dev_weights, d_minus)
    )
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary/linearized indicators to exact integers to remove floating-point tolerance noise.
    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "pair_products": [round(pulp.value(v)) for v in pair_products],
        "peak_load": float(pulp.value(peak_load)),
        "total_cost": float(pulp.value(prob.objective)),
    }
