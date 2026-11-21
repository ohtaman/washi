import pulp


def solve(min_protein, min_fiber) -> dict:
    """Return {"oats": float, "beans": float, "totalCost": float}."""
    prob = pulp.LpProblem("diet", pulp.LpMinimize)

    oats = pulp.LpVariable("oats", lowBound=0)
    beans = pulp.LpVariable("beans", lowBound=0)

    prob += 2 * oats + beans >= min_protein
    prob += oats + 3 * beans >= min_fiber

    prob += 30 * oats + 50 * beans
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "oats": float(pulp.value(oats)),
        "beans": float(pulp.value(beans)),
        "totalCost": float(pulp.value(prob.objective)),
    }
