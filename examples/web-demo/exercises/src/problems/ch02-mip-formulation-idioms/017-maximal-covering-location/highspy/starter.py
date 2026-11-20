import pulp


def solve(input_data: dict) -> dict:
    """Return {"open": list[int], "covered": list[int], "totalCoveredDemand": float}."""
    demands = input_data["demands"]
    distances = input_data["distances"]
    radius = input_data["coverageRadius"]
    max_facilities = input_data["maxFacilities"]
    n = len(demands)
    m_sites = len(distances[0]) if n > 0 else 0

    prob = pulp.LpProblem("maximal_covering_location", pulp.LpMaximize)
    open_vars = [pulp.LpVariable(f"open_{j}", cat=pulp.LpBinary) for j in range(m_sites)]
    covered = [pulp.LpVariable(f"cov_{i}", cat=pulp.LpBinary) for i in range(n)]

    # TODO:
    # 1. Limit open facilities: sum(open_vars) <= max_facilities
    # 2. Link coverage: covered[i] <= sum(open_vars[j] for j if distances[i][j] <= radius)
    # 3. Maximize covered demand, solve with HiGHS, and return dict
    raise NotImplementedError("Not implemented")
