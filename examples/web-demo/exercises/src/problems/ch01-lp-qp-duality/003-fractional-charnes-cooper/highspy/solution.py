import highspy


def solve(input_data: dict) -> dict:
    base_rev = input_data["baseRevenue"]
    base_cost = input_data["baseCost"]
    revenues = input_data["revenues"]
    costs = input_data["costs"]
    capacities = input_data["capacities"]
    min_total = input_data["minTotal"]
    max_total = input_data["maxTotal"]
    green_idx = input_data["greenIndex"]
    min_green = input_data["minGreenShare"]
    n = len(revenues)

    h = highspy.Highs()
    h.silent()

    t = h.addVariable(lb=0.0, name="t")
    y = [h.addVariable(lb=0.0, name=f"y_{i}") for i in range(n)]

    h.addConstr(base_cost * t + h.qsum(costs[i] * y[i] for i in range(n)) == 1.0)
    for i in range(n):
        h.addConstr(y[i] <= capacities[i] * t)

    total_y = h.qsum(y)
    h.addConstr(total_y >= min_total * t)
    h.addConstr(total_y <= max_total * t)
    h.addConstr(y[green_idx] >= min_green * total_y)

    h.maximize(base_rev * t + h.qsum(revenues[i] * y[i] for i in range(n)))

    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    t_val = float(h.val(t))
    return {
        "quantities": [float(h.val(v)) / t_val for v in y],
        "ratio": float(h.getObjectiveValue()),
    }
