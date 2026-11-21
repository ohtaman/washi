import pulp


def solve(flourCap, butterCap) -> dict:
    """Return {"croissants": float, "loaves": float, "totalProfit": float}."""
    prob = pulp.LpProblem("Bakery", pulp.LpMaximize)

    c = pulp.LpVariable("croissants", lowBound=0)
    l = pulp.LpVariable("loaves", lowBound=0)

    prob += 2 * c + 3 * l <= flourCap, "flour"
    prob += c + 2 * l <= butterCap, "butter"
    prob += 40 * c + 70 * l, "total_profit"

    prob.solve(pulp.HiGHS(msg=False))

    return {
        "croissants": float(pulp.value(c)),
        "loaves": float(pulp.value(l)),
        "totalProfit": float(pulp.value(prob.objective)),
    }
