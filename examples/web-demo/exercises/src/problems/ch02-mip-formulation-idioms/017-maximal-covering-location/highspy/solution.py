import pulp


def solve(demands, distances, coverage_radius, max_facilities) -> dict:
    """Return {"open": list[int], "covered": list[int], "total_covered_demand": float}."""
    radius = coverage_radius
    n = len(demands)
    m_sites = len(distances[0]) if n > 0 else 0

    prob = pulp.LpProblem("maximal_covering_location", pulp.LpMaximize)
    open_vars = [pulp.LpVariable(f"open_{j}", cat=pulp.LpBinary) for j in range(m_sites)]
    covered = [pulp.LpVariable(f"cov_{i}", cat=pulp.LpBinary) for i in range(n)]

    prob += pulp.lpSum(open_vars) <= max_facilities
    for i in range(n):
        prob += covered[i] <= pulp.lpSum(
            open_vars[j] for j in range(m_sites) if distances[i][j] <= radius
        )

    prob += pulp.lpDot(demands, covered)
    prob.solve(pulp.HiGHS(msg=False))

    return {
        "open": [round(pulp.value(v)) for v in open_vars],
        "covered": [round(pulp.value(v)) for v in covered],
        "total_covered_demand": float(pulp.value(prob.objective)),
    }
