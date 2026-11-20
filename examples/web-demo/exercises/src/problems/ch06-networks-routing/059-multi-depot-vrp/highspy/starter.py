import pulp


def solve(input_data: dict) -> dict:
    """Return {"routes": list[list[int]], "totalDistance": float}."""
    dist = input_data["dist"]
    demands = input_data["demands"]
    q_cap = input_data["vehicleCapacity"]
    depot_max_v = input_data["depotMaxVehicles"]
    depot_caps = input_data["depotCapacities"]
    num_depots = len(depot_max_v)
    n = len(dist)

    prob = pulp.LpProblem("mdvrp", pulp.LpMinimize)
    x = {}
    for d in range(num_depots):
        vd = [d] + list(range(num_depots, n))
        for i in vd:
            for j in vd:
                if i != j:
                    x[(i, j, d)] = pulp.LpVariable(f"x_{i}_{j}_{d}", cat=pulp.LpBinary)

    u = {
        i: pulp.LpVariable(f"u_{i}", lowBound=demands[i], upBound=q_cap, cat=pulp.LpContinuous)
        for i in range(num_depots, n)
    }

    # TODO:
    # 1. Each customer i >= num_depots visited once across all depots
    # 2. Per-depot customer flow conservation, fleet cap <= depot_max_v[d], depot supply <= depot_caps[d]
    # 3. Load-tracking MTZ for customer pairs: u[i] - u[j] + q_cap * sum_d x[(i, j, d)] <= q_cap - demands[j]
    # 4. Minimize total distance, solve with `prob.solve(pulp.HiGHS(msg=False))`, and extract routes
    raise NotImplementedError("Not implemented")
