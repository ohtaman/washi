import pulp


def solve(margins, minBatches, maxBatches, resourceUsages, resourceCap) -> dict:
    """Return {"active": list[int], "quantities": list[float], "totalMargin": float}."""
    min_batches = minBatches
    max_batches = maxBatches
    usages = resourceUsages
    cap = resourceCap
    n = len(margins)

    prob = pulp.LpProblem("semi_continuous_production", pulp.LpMaximize)

    active = [pulp.LpVariable(f"active_{i}", cat=pulp.LpBinary) for i in range(n)]
    quantities = [pulp.LpVariable(f"qty_{i}", lowBound=0) for i in range(n)]

    # TODO: Link each product's semi-continuous bounds, enforce the resource cap, maximize total margin, and return the output.
    raise NotImplementedError("Not implemented")
