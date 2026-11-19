import highspy


def solve(input_data: dict) -> dict:
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

    # TODO:
    # 1. Enforce row sum <= supplies[i] and column sum >= demands[j]
    # 2. Call h.minimize(...) on sum(unit_costs[i][j] * shipments[i][j])
    # 3. Return {"shipments": [[float(h.val(v)) for v in row] for row in shipments], "totalCost": float(h.getObjectiveValue())}
    raise NotImplementedError("Not implemented")
