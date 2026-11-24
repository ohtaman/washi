import pulp


def solve(flour_cap, butter_cap) -> dict:
    """Return {"croissants": float, "loaves": float, "total_profit": float}."""
    prob = pulp.LpProblem("Bakery", pulp.LpMaximize)

    # Decision variables: continuous non-negative quantities of croissants and loaves to bake.
    c = pulp.LpVariable("croissants", lowBound=0)
    l = pulp.LpVariable("loaves", lowBound=0)

    # Resource capacity constraints for flour and butter.
    prob += 2 * c + 3 * l <= flour_cap, "flour"
    prob += c + 2 * l <= butter_cap, "butter"
    # Objective: maximize total profit from both baked goods.
    prob += 40 * c + 70 * l, "total_profit"

    prob.solve(pulp.HiGHS(msg=False))

    return {
        "croissants": float(pulp.value(c)),
        "loaves": float(pulp.value(l)),
        "total_profit": float(pulp.value(prob.objective)),
    }
