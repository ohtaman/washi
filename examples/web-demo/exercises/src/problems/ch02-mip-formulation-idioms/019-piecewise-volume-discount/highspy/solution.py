import pulp


def solve(demand, suppliers) -> dict:
    """Return {"tier_selected": list[list[int]], "tier_quantities": list[list[float]], "total_cost": float}."""

    prob = pulp.LpProblem("volume_discount", pulp.LpMinimize)
    tier_sel = [
        [pulp.LpVariable(f"y_{s}_{k}", cat=pulp.LpBinary) for k in range(len(tiers))]
        for s, tiers in enumerate(suppliers)
    ]
    tier_qty = [
        [pulp.LpVariable(f"q_{s}_{k}", lowBound=0) for k in range(len(tiers))]
        for s, tiers in enumerate(suppliers)
    ]

    for s, tiers in enumerate(suppliers):
        prob += pulp.lpSum(tier_sel[s]) <= 1
        for k, tier in enumerate(tiers):
            prob += tier["minQty"] * tier_sel[s][k] <= tier_qty[s][k]
            prob += tier_qty[s][k] <= tier["maxQty"] * tier_sel[s][k]

    prob += pulp.lpSum(q for row in tier_qty for q in row) >= demand
    prob += pulp.lpSum(
        tier["unitPrice"] * tier_qty[s][k]
        for s, tiers in enumerate(suppliers)
        for k, tier in enumerate(tiers)
    )
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "tier_selected": [[round(pulp.value(v)) for v in row] for row in tier_sel],
        "tier_quantities": [[float(pulp.value(v)) for v in row] for row in tier_qty],
        "total_cost": float(pulp.value(prob.objective)),
    }
