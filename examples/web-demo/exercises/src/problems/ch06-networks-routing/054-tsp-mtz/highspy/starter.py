import pulp


def solve(input_data: dict) -> dict:
    """Return {"tour": list[int], "totalCost": float}."""
    dist = input_data["dist"]
    n = len(dist)

    prob = pulp.LpProblem("tsp_mtz", pulp.LpMinimize)
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) if i != j else None for j in range(n)]
        for i in range(n)
    ]
    u = [
        pulp.LpVariable(f"u_{i}", lowBound=1, upBound=n - 1, cat=pulp.LpContinuous)
        if i > 0
        else None
        for i in range(n)
    ]

    # TODO:
    # 1. Enforce out-degree == 1 and in-degree == 1 for every city
    # 2. Add MTZ subtour-elimination constraints for all i != j in 1..n-1
    # 3. Minimize total tour cost, call `prob.solve(pulp.HiGHS(msg=False))`,
    #    and reconstruct {"tour": ..., "totalCost": ...} starting at city 0
    raise NotImplementedError("Not implemented")
