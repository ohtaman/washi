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
    """Return {"selected": list[int], "pairProducts": list[int], "peakLoad": float, "totalCost": float}."""
    n = len(base_costs)
    m_zones = len(loads)
    P = len(pairs)

    prob = pulp.LpProblem("linearization_synthesis", pulp.LpMinimize)

    selected = [pulp.LpVariable(f"x_{i}", cat=pulp.LpBinary) for i in range(n)]
    pair_products = [pulp.LpVariable(f"w_{k}", lowBound=0, upBound=1) for k in range(P)]
    peak_load = pulp.LpVariable("peak", lowBound=0)
    d_plus = [pulp.LpVariable(f"dp_{r}", lowBound=0) for r in range(m_zones)]
    d_minus = [pulp.LpVariable(f"dm_{r}", lowBound=0) for r in range(m_zones)]

    prob += pulp.lpDot(values, selected) >= min_value
    for r in range(m_zones):
        zone_load = pulp.lpDot(loads[r], selected)
        prob += zone_load <= peak_load
        prob += zone_load - targets[r] == d_plus[r] - d_minus[r]

    for k, (i, j, _) in enumerate(pairs):
        prob += pair_products[k] <= selected[i]
        prob += pair_products[k] <= selected[j]
        prob += pair_products[k] >= selected[i] + selected[j] - 1

    pair_costs = [s for _, _, s in pairs]
    prob += (
        pulp.lpDot(base_costs, selected)
        + pulp.lpDot(pair_costs, pair_products)
        + peak_weight * peak_load
        + pulp.lpDot(dev_weights, d_plus)
        + pulp.lpDot(dev_weights, d_minus)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "selected": [round(pulp.value(v)) for v in selected],
        "pairProducts": [round(pulp.value(v)) for v in pair_products],
        "peakLoad": float(pulp.value(peak_load)),
        "totalCost": float(pulp.value(prob.objective)),
    }
