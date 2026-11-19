import highspy


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "totalValue": float}."""
    budget = input_data["budget"]
    costs = input_data["costs"]
    values = input_data["values"]
    n = len(costs)

    h = highspy.Highs()
    h.silent()

    selected = [h.addBinary(name=f"sel_{i}") for i in range(n)]

    # TODO:
    # 1. Add budget constraint sum(costs[i] * selected[i]) <= budget
    # 2. Maximize sum(values[i] * selected[i])
    # 3. Return {"selected": [round(h.val(v)) for v in selected], "totalValue": float(h.getObjectiveValue())}
    raise NotImplementedError("Not implemented")
