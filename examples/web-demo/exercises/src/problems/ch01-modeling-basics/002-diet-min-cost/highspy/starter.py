import pulp


def solve(min_protein, min_fiber) -> dict:
    """Return {"oats": float, "beans": float, "totalCost": float}."""
    prob = pulp.LpProblem("diet", pulp.LpMinimize)

    oats = pulp.LpVariable("oats", lowBound=0)
    beans = pulp.LpVariable("beans", lowBound=0)

    # TODO: Add >= constraints for protein (2*oats + beans) and fiber (oats + 3*beans)

    prob += 30 * oats + 50 * beans
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "oats": float(pulp.value(oats)),
        "beans": float(pulp.value(beans)),
        "totalCost": float(pulp.value(prob.objective)),
    }
