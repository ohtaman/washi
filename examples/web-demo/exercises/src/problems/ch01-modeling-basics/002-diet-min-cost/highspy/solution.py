import pulp


def solve(input_data: dict) -> dict:
    """Return {"oats": float, "beans": float, "totalCost": float}."""
    prob = pulp.LpProblem("diet", pulp.LpMinimize)

    oats = pulp.LpVariable("oats", lowBound=0)
    beans = pulp.LpVariable("beans", lowBound=0)

    prob += 2 * oats + beans >= input_data["minProtein"]
    prob += oats + 3 * beans >= input_data["minFiber"]

    prob += 30 * oats + 50 * beans
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "oats": float(pulp.value(oats)),
        "beans": float(pulp.value(beans)),
        "totalCost": float(pulp.value(prob.objective)),
    }
