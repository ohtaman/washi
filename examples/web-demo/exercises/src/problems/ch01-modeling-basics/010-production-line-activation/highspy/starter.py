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

    # TODO:
    # 1. Enforce quantities[i] <= capacities[i] * open_vars[i] for each i
    # 2. Enforce shared material budget <= mat_cap
    # 3. Call h.maximize(...) on net profit and return {"open": ..., "quantities": ..., "netProfit": ...}
    raise NotImplementedError("Not implemented")
