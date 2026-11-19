import highspy


def solve(input_data: dict) -> dict:
    budget = input_data["budget"]
    costs = input_data["costs"]
    values = input_data["values"]
    n = len(costs)

    h = highspy.Highs()
    h.silent()

    selected = [h.addBinary(name=f"sel_{i}") for i in range(n)]

    h.addConstr(h.qsum(costs[i] * selected[i] for i in range(n)) <= budget)
    h.maximize(h.qsum(values[i] * selected[i] for i in range(n)))

    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    return {
        "selected": [round(h.val(v)) for v in selected],
        "totalValue": float(h.getObjectiveValue()),
    }
