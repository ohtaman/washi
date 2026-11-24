import pulp


def solve(demand, suppliers) -> dict:
    """Return {"tier_selected": list[list[int]], "tier_quantities": list[list[float]], "total_cost": float}."""

    prob = pulp.LpProblem("volume_discount", pulp.LpMinimize)
    # Decision variables: binary tier_sel[s][k] (1 if supplier s uses tier k) and continuous tier_qty[s][k] >= 0.
    tier_sel = [
        [pulp.LpVariable(f"y_{s}_{k}", cat=pulp.LpBinary) for k in range(len(tiers))]
        for s, tiers in enumerate(suppliers)
    ]
    tier_qty = [
        [pulp.LpVariable(f"q_{s}_{k}", lowBound=0) for k in range(len(tiers))]
        for s, tiers in enumerate(suppliers)
    ]

    # Per supplier: select at most one tier, and enforce [minQty, maxQty] when that tier is active.
    for s, tiers in enumerate(suppliers):
        prob += pulp.lpSum(tier_sel[s]) <= 1
        for k, tier in enumerate(tiers):
            prob += tier["minQty"] * tier_sel[s][k] <= tier_qty[s][k]
            prob += tier_qty[s][k] <= tier["maxQty"] * tier_sel[s][k]

    # Total purchased quantity must meet demand; objective minimizes total procurement cost.
    prob += pulp.lpSum(q for row in tier_qty for q in row) >= demand
    prob += pulp.lpSum(
        tier["unitPrice"] * tier_qty[s][k]
        for s, tiers in enumerate(suppliers)
        for k, tier in enumerate(tiers)
    )
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to exact integers to remove floating-point tolerance noise.
    return {
        "tier_selected": [[round(pulp.value(v)) for v in row] for row in tier_sel],
        "tier_quantities": [[float(pulp.value(v)) for v in row] for row in tier_qty],
        "total_cost": float(pulp.value(prob.objective)),
    }
