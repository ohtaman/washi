import pulp


def solve(
    min_orders,
    max_orders,
    base_costs,
    discounts,
    contract_fees,
    total_demand,
) -> dict:
    """Return {"b": list[int], "x": list[float], "z": list[float], "total_cost": float}."""
    min_ord = min_orders
    max_ord = max_orders
    fees = contract_fees
    demand = total_demand
    n = len(min_ord)

    prob = pulp.LpProblem("glover_product", pulp.LpMinimize)

    # TODO: Build and solve the linearized contract procurement MIP, then return the output.
    raise NotImplementedError("Not implemented")
