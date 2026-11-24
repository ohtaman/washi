import pulp


def solve(fixed_costs, unit_costs, capacities, demand) -> dict:
    """Return {"open": list[int], "quantities": list[float], "total_cost": float, "lp_bound": float}."""
    # TODO: Build and solve the tight Big-M MIP and its LP relaxation, then return the output.
    raise NotImplementedError("Not implemented")
