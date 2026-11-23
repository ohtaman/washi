import pulp


def solve(profits, budgets, emissions, budget_cap, epsilons) -> dict:
    """Return {"selections": list[list[int]], "frontierProfits": list[float], "frontierSum": float}."""
    n = len(profits)

    selections = []
    frontier_profits = []

    for k, eps in enumerate(epsilons):
        prob = pulp.LpProblem(f"epsilon_pareto_{k}", pulp.LpMaximize)
        x = [pulp.LpVariable(f"x_{j}", cat=pulp.LpBinary) for j in range(n)]

        prob += pulp.lpDot(budgets, x) <= budget_cap
        prob += pulp.lpDot(emissions, x) <= eps
        prob += pulp.lpDot(profits, x)
        prob.solve(pulp.HiGHS(msg=False))

        selections.append([round(pulp.value(v)) for v in x])
        frontier_profits.append(float(pulp.value(prob.objective)))

    return {
        "selections": selections,
        "frontierProfits": frontier_profits,
        "frontierSum": float(sum(frontier_profits)),
    }
