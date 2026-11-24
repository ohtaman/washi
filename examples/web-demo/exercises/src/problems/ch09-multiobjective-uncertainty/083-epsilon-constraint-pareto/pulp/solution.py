import pulp


def solve(profits, budgets, emissions, budget_cap, epsilons) -> dict:
    """Return {"selections": list[list[int]], "frontier_profits": list[float], "frontier_sum": float}."""
    n = len(profits)

    selections = []
    frontier_profits = []

    # Sweep each epsilon cap on emissions to trace the Pareto frontier
    for k, eps in enumerate(epsilons):
        prob = pulp.LpProblem(f"epsilon_pareto_{k}", pulp.LpMaximize)
        # x[j] = 1 if project j is selected
        x = [pulp.LpVariable(f"x_{j}", cat=pulp.LpBinary) for j in range(n)]

        # Budget limit and epsilon-constraint on total emissions
        prob += pulp.lpDot(budgets, x) <= budget_cap
        prob += pulp.lpDot(emissions, x) <= eps
        # Maximize profit for the given emission cap
        prob += pulp.lpDot(profits, x)
        prob.solve(pulp.HiGHS(msg=False))

        # Round binary solver values to clean 0/1 integers
        selections.append([round(pulp.value(v)) for v in x])
        frontier_profits.append(float(pulp.value(prob.objective)))

    return {
        "selections": selections,
        "frontier_profits": frontier_profits,
        "frontier_sum": float(sum(frontier_profits)),
    }
