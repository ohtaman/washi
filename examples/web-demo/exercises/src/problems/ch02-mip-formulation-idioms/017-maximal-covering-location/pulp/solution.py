import pulp


def solve(demands, distances, coverage_radius, max_facilities) -> dict:
    """Return {"open": list[int], "covered": list[int], "total_covered_demand": float}."""
    radius = coverage_radius
    n = len(demands)
    m_sites = len(distances[0]) if n > 0 else 0

    prob = pulp.LpProblem("maximal_covering_location", pulp.LpMaximize)
    # Decision variables: binary open_vars[j] (facility built at site j) and covered[i] (demand node i is covered).
    open_vars = [pulp.LpVariable(f"open_{j}", cat=pulp.LpBinary) for j in range(m_sites)]
    covered = [pulp.LpVariable(f"cov_{i}", cat=pulp.LpBinary) for i in range(n)]

    # Limit total number of open facilities.
    prob += pulp.lpSum(open_vars) <= max_facilities
    # Coverage linking: node i can be covered only if at least one facility within radius is open.
    for i in range(n):
        prob += covered[i] <= pulp.lpSum(
            open_vars[j] for j in range(m_sites) if distances[i][j] <= radius
        )

    # Objective: maximize total covered demand.
    prob += pulp.lpDot(demands, covered)
    prob.solve(pulp.HiGHS(msg=False))

    # Round binary indicators to exact integers to remove floating-point tolerance noise.
    return {
        "open": [round(pulp.value(v)) for v in open_vars],
        "covered": [round(pulp.value(v)) for v in covered],
        "total_covered_demand": float(pulp.value(prob.objective)),
    }
