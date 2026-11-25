import pulp


def solve(
    dist,
    demands,
    vehicle_capacity,
    depot_max_vehicles,
    depot_capacities,
) -> dict:
    """Return {"routes": list[list[int]], "total_distance": float}."""
    q_cap = vehicle_capacity
    depot_max_v = depot_max_vehicles
    depot_caps = depot_capacities
    num_depots = len(depot_max_v)
    n = len(dist)

    prob = pulp.LpProblem("mdvrp", pulp.LpMinimize)
    # x[(i, j, d)] in {0, 1}: binary indicator that a vehicle from depot d traverses arc i -> j
    x = {}
    for d in range(num_depots):
        vd = [d] + list(range(num_depots, n))
        for i in vd:
            for j in vd:
                if i != j:
                    x[(i, j, d)] = pulp.LpVariable(f"x_{i}_{j}_{d}", cat=pulp.LpBinary)

    # u[i] in [demands[i], q_cap]: continuous cumulative vehicle load after serving customer i
    u = {
        i: pulp.LpVariable(f"u_{i}", lowBound=demands[i], upBound=q_cap, cat=pulp.LpContinuous)
        for i in range(num_depots, n)
    }

    # Every customer is visited exactly once across all depots
    for i in range(num_depots, n):
        prob += (
            pulp.lpSum(
                x[(i, j, d)]
                for d in range(num_depots)
                for j in ([d] + list(range(num_depots, n)))
                if j != i
            )
            == 1
        )

    # Per-depot flow conservation, fleet size cap, and total depot demand capacity
    for d in range(num_depots):
        vd = [d] + list(range(num_depots, n))
        for i in range(num_depots, n):
            prob += pulp.lpSum(x[(j, i, d)] for j in vd if j != i) == pulp.lpSum(
                x[(i, j, d)] for j in vd if j != i
            )
        prob += pulp.lpSum(x[(d, j, d)] for j in range(num_depots, n)) <= depot_max_v[d]
        prob += pulp.lpSum(x[(d, j, d)] for j in range(num_depots, n)) == pulp.lpSum(
            x[(i, d, d)] for i in range(num_depots, n)
        )
        prob += (
            pulp.lpSum(
                demands[i] * pulp.lpSum(x[(i, j, d)] for j in vd if j != i)
                for i in range(num_depots, n)
            )
            <= depot_caps[d]
        )

    # MTZ capacity & subtour elimination across all customer pairs
    for i in range(num_depots, n):
        for j in range(num_depots, n):
            if i != j:
                y_ij = pulp.lpSum(x[(i, j, d)] for d in range(num_depots))
                prob += u[i] - u[j] + q_cap * y_ij <= q_cap - demands[j]

    # Minimize total travel distance across all depots and routes
    prob += pulp.lpSum(dist[i][j] * var for (i, j, _d), var in x.items())
    prob.solve(pulp.HiGHS(msg=False))

    # Reconstruct each vehicle route starting and ending at its assigned depot d
    routes = []
    for d in range(num_depots):
        vd = [d] + list(range(num_depots, n))
        for j in range(num_depots, n):
            if round(pulp.value(x[(d, j, d)])) == 1:
                route = [d, j]
                cur = j
                while cur != d:
                    nxt = next(k for k in vd if k != cur and round(pulp.value(x[(cur, k, d)])) == 1)
                    route.append(nxt)
                    cur = nxt
                routes.append(route)

    return {
        "routes": routes,
        "total_distance": float(pulp.value(prob.objective)),
    }
