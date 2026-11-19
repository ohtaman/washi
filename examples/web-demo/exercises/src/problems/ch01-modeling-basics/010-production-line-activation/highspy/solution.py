import highspy


def solve(input_data: dict) -> dict:
    margins = input_data["margins"]
    fixed_costs = input_data["fixedCosts"]
    capacities = input_data["capacities"]
    mat_usages = input_data["materialUsages"]
    mat_cap = input_data["materialCap"]
    n = len(margins)

    h = highspy.Highs()
    h.silent()

    open_vars = [h.addBinary(name=f"open_{i}") for i in range(n)]
    quantities = [h.addVariable(lb=0.0, name=f"qty_{i}") for i in range(n)]

    for i in range(n):
        h.addConstr(quantities[i] - capacities[i] * open_vars[i] <= 0)
    h.addConstr(h.qsum(mat_usages[i] * quantities[i] for i in range(n)) <= mat_cap)

    h.maximize(
        h.qsum(margins[i] * quantities[i] - fixed_costs[i] * open_vars[i] for i in range(n))
    )

    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    return {
        "open": [round(h.val(v)) for v in open_vars],
        "quantities": [float(h.val(v)) for v in quantities],
        "netProfit": float(h.getObjectiveValue()),
    }
