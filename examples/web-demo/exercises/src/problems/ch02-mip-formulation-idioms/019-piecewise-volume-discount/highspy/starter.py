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

    # TODO: Enforce at most one tier per supplier, link tier quantity bounds, meet total demand, minimize cost, and return the result.
    raise NotImplementedError("Not implemented")
