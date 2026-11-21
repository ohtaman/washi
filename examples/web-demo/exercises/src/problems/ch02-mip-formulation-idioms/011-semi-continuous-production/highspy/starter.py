import pulp


def solve(margins, min_batches, max_batches, resource_usages, resource_cap) -> dict:
    """Return {"active": list[int], "quantities": list[float], "totalMargin": float}."""
    usages = resource_usages
    cap = resource_cap
    n = len(margins)

    prob = pulp.LpProblem("semi_continuous_production", pulp.LpMaximize)

    active = [pulp.LpVariable(f"active_{i}", cat=pulp.LpBinary) for i in range(n)]
    quantities = [pulp.LpVariable(f"qty_{i}", lowBound=0) for i in range(n)]

    # TODO: Link each product's semi-continuous bounds, enforce the resource cap, maximize total margin, and return the output.
    raise NotImplementedError("Not implemented")
