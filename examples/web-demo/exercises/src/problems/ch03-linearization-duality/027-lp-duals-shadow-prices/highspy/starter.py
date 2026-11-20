import pulp


def solve(input_data: dict) -> dict:
    """Return {"quantities": list[float], "duals": list[float], "optimalCost": float}."""
    costs = input_data["costs"]
    capacities = input_data["capacities"]
    yields = input_data["yields"]
    min_reqs = input_data["minRequirements"]
    usages = input_data["resourceUsages"]
    max_res = input_data["maxResources"]
    n = len(costs)

    prob = pulp.LpProblem("shadow_prices", pulp.LpMinimize)

    quantities = [
        pulp.LpVariable(f"x_{i}", lowBound=0, upBound=float(capacities[i]))
        for i in range(n)
    ]

    # TODO:
    # 1. Create >= constraints for min_reqs and <= constraints for max_res and add to prob
    # 2. Minimize lpDot(costs, quantities), call prob.solve(pulp.HiGHS(msg=False))
    # 3. Read c.pi for each requirement constraint followed by each resource cap constraint
    raise NotImplementedError("Not implemented")
