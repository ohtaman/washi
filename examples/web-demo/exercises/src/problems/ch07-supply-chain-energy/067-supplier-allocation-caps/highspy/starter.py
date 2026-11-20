import pulp


def solve(input_data: dict) -> dict:
    """Return {"active": list[int], "allocations": list[list[float]], "totalCost": float}."""
    prob = pulp.LpProblem("supplier_allocation_caps", pulp.LpMinimize)

    # TODO:
    # 1. Create binary active[s] and continuous allocations[s][p] <= maxShare * demands[p]
    # 2. Add supplier cardinality bounds, semi-continuous order bounds, and plant demand equations
    # 3. Minimize fixed + variable cost, solve with pulp.HiGHS(msg=False), and return outputs
    raise NotImplementedError("Not implemented")
