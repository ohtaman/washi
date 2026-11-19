import highspy


def solve(input_data: dict) -> dict:
    """Return {"shipments": list[list[float]], "totalCost": float}."""
    supplies = input_data["supplies"]
    demands = input_data["demands"]
    unit_costs = input_data["unitCosts"]
    n_s = len(supplies)
    n_d = len(demands)

    h = highspy.Highs()
    h.silent()

    shipments = [
        [h.addVariable(lb=0.0, name=f"ship_{i}_{j}") for j in range(n_d)]
        for i in range(n_s)
    ]

    for i in range(n_s):
        h.addConstr(h.qsum(shipments[i][j] for j in range(n_d)) <= supplies[i])
    for j in range(n_d):
        h.addConstr(h.qsum(shipments[i][j] for i in range(n_s)) >= demands[j])

    h.minimize(
        h.qsum(unit_costs[i][j] * shipments[i][j] for i in range(n_s) for j in range(n_d))
    )

    return {
        "shipments": [[float(h.val(v)) for v in row] for row in shipments],
        "totalCost": float(h.getObjectiveValue()),
    }
