import pulp


def solve(input_data: dict) -> dict:
    """Return {"selections": list[list[int]], "frontierProfits": list[float], "frontierSum": float}."""
    profits = input_data["profits"]
    budgets = input_data["budgets"]
    emissions = input_data["emissions"]
    budget_cap = input_data["budgetCap"]
    epsilons = input_data["epsilons"]
    n = len(profits)

    # TODO:
    # For each emission threshold eps in epsilons:
    # 1. Build an MIP maximizing pulp.lpDot(profits, x)
    # 2. Enforce budget_cap and emission <= eps
    # 3. Solve with pulp.HiGHS(msg=False) and collect selections, frontierProfits, frontierSum
    raise NotImplementedError("Not implemented")
