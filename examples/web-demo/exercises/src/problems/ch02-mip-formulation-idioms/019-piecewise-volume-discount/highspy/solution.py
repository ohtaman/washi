import pulp


def solve(input_data: dict) -> dict:
    """Return {"tierSelected": list[list[int]], "tierQuantities": list[list[float]], "totalCost": float}."""
    demand = input_data["demand"]
    suppliers = input_data["suppliers"]

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
        "tierSelected": [[round(pulp.value(v)) for v in row] for row in tier_sel],
        "tierQuantities": [[float(pulp.value(v)) for v in row] for row in tier_qty],
        "totalCost": float(pulp.value(prob.objective)),
    }
