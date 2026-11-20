import pulp


def solve(input_data: dict) -> dict:
    """Return {"produced": list[float], "inventories": list[float], "shortfalls": list[float], "totalCost": float}."""
    actual = input_data["actualDemands"]
    forecasts = input_data["forecastDemands"]
    prod_costs = input_data["prodCosts"]
    prod_cap = input_data["prodCap"]
    hold_cost = input_data["holdCost"]
    shortfall_pen = input_data["shortfallPenalty"]
    inv_curr = float(input_data["initialInventory"])
    window_len = input_data["windowLen"]
    T = len(actual)

    produced = []
    inventories = []
    shortfalls = []
    total_cost = 0.0

    for t in range(T):
        end = min(T, t + window_len)
        L = end - t
        prob = pulp.LpProblem(f"mpc_{t}", pulp.LpMinimize)
        x = [pulp.LpVariable(f"x_{k}", lowBound=0, upBound=prod_cap) for k in range(L)]
        inv = [pulp.LpVariable(f"inv_{k}", lowBound=0) for k in range(L)]
        sh = [pulp.LpVariable(f"sh_{k}", lowBound=0) for k in range(L)]

        for k in range(L):
            prev = inv_curr if k == 0 else inv[k - 1]
            prob += prev + x[k] + sh[k] - inv[k] == forecasts[t + k]

        prob += (
            pulp.lpDot(prod_costs[t:end], x)
            + hold_cost * pulp.lpSum(inv)
            + shortfall_pen * pulp.lpSum(sh)
        )
        prob.solve(pulp.HiGHS(msg=False))

        xt = float(pulp.value(x[0]))
        supply = inv_curr + xt
        next_inv = max(0.0, supply - actual[t])
        realized_short = max(0.0, actual[t] - supply)

        produced.append(xt)
        inventories.append(next_inv)
        shortfalls.append(realized_short)
        total_cost += (
            prod_costs[t] * xt
            + hold_cost * next_inv
            + shortfall_pen * realized_short
        )
        inv_curr = next_inv

    return {
        "produced": produced,
        "inventories": inventories,
        "shortfalls": shortfalls,
        "totalCost": float(total_cost),
    }
