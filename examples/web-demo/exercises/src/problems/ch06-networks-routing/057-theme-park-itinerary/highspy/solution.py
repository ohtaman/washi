import pulp


def solve(travel_times, earliest, latest, visit_durations, max_groups) -> dict:
    """Return {"itineraries": list[list[int]], "total_cost": float}."""
    n = len(travel_times)

    prob = pulp.LpProblem("theme_park_itinerary", pulp.LpMinimize)
    x = [
        [pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary) if i != j else None for j in range(n)]
        for i in range(n)
    ]
    t = [
        pulp.LpVariable(f"t_{i}", lowBound=earliest[i], upBound=latest[i], cat=pulp.LpContinuous)
        for i in range(n)
    ]
    max_attractions = max(1, n - 1)
    u = [
        pulp.LpVariable(f"u_{i}", lowBound=1, upBound=max_attractions, cat=pulp.LpContinuous)
        if i >= 1
        else None
        for i in range(n)
    ]

    prob += t[0] == earliest[0]
    for i in range(1, n):
        prob += pulp.lpSum(x[i][j] for j in range(n) if j != i) == 1
        prob += pulp.lpSum(x[j][i] for j in range(n) if j != i) == 1

    prob += pulp.lpSum(x[0][j] for j in range(1, n)) <= max_groups
    prob += pulp.lpSum(x[0][j] for j in range(1, n)) == pulp.lpSum(x[i][0] for i in range(1, n))

    for j in range(1, n):
        m0j = max(0, earliest[0] + visit_durations[0] + travel_times[0][j] - earliest[j])
        prob += t[0] + visit_durations[0] + travel_times[0][j] - t[j] <= m0j * (1 - x[0][j])

    for i in range(1, n):
        mi0 = max(0, latest[i] + visit_durations[i] + travel_times[i][0] - latest[0])
        prob += t[i] + visit_durations[i] + travel_times[i][0] <= latest[0] + mi0 * (1 - x[i][0])
        for j in range(1, n):
            if i != j:
                mij = max(0, latest[i] + visit_durations[i] + travel_times[i][j] - earliest[j])
                prob += t[i] + visit_durations[i] + travel_times[i][j] - t[j] <= mij * (1 - x[i][j])
                prob += u[i] + 1 - u[j] <= max_attractions * (1 - x[i][j])

    prob += pulp.lpSum(
        travel_times[i][j] * x[i][j] for i in range(n) for j in range(n) if i != j
    )
    prob.solve(pulp.HiGHS(msg=False))

    itineraries = []
    for j in range(1, n):
        if round(pulp.value(x[0][j])) == 1:
            route = [0, j]
            cur = j
            while cur != 0:
                nxt = next(k for k in range(n) if k != cur and round(pulp.value(x[cur][k])) == 1)
                route.append(nxt)
                cur = nxt
            itineraries.append(route)

    return {
        "itineraries": itineraries,
        "total_cost": float(pulp.value(prob.objective)),
    }
