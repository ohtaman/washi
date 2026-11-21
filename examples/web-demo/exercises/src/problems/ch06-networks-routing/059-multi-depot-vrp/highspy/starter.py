import pulp


def solve(
    dist,
    demands,
    vehicle_capacity,
    depot_max_vehicles,
    depot_capacities,
) -> dict:
    """Return {"routes": list[list[int]], "totalDistance": float}."""
    # TODO: Build and solve the multi-depot VRP MIP, then reconstruct and return the routes.
    raise NotImplementedError("Not implemented")
