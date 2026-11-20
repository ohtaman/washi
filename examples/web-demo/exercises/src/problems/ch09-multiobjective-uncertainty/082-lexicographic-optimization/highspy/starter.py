import pulp


def solve(input_data: dict) -> dict:
    """Return {"selected": list[int], "obj1": float, "obj2": float}."""
    coverage = input_data["coverage"]
    crews = input_data["crews"]
    op_costs = input_data["opCosts"]
    max_crews = input_data["maxCrews"]
    target_demand = input_data["targetDemand"]
    slack = input_data["slack"]
    n = len(coverage)

    # TODO:
    # 1. Stage 1: minimize unmet demand shortfall subject to crew capacity
    # 2. Stage 2: lock shortfall <= best_obj1 + slack and minimize secondary operating cost
    # 3. Return {"selected": ..., "obj1": ..., "obj2": ...}
    raise NotImplementedError("Not implemented")
