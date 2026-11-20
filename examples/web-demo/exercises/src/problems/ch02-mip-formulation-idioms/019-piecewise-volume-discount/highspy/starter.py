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

    # TODO:
    # 1. Select at most one tier per supplier: sum(tier_sel[s]) <= 1
    # 2. Link tier bounds: minQty * y <= q <= maxQty * y
    # 3. Require total ordered >= demand and minimize total cost
    raise NotImplementedError("Not implemented")
