import pulp


def solve(input_data: dict) -> dict:
    """Return {"produced": list[float], "inventories": list[float], "shortfalls": list[float], "totalCost": float}."""
    actual = input_data["actualDemands"]
    forecasts = input_data["forecastDemands"]
    prod_costs = input_data["prodCosts"]
    prod_cap = input_data["prodCap"]
    hold_cost = input_data["holdCost"]
    shortfall_pen = input_data["shortfallPenalty"]
    init_inv = input_data["initialInventory"]
    window_len = input_data["windowLen"]
    T = len(actual)

    # TODO:
    # For each period t = 0 .. T - 1:
    # 1. Solve lookahead LP over [t, min(T, t + window_len)) using forecastDemands and current inventory
    # 2. Commit only x[0] as produced[t]
    # 3. Realize actual[t] demand to update inventory, shortfall, and realized totalCost
    raise NotImplementedError("Not implemented")
