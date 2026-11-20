import pulp


def solve(input_data: dict) -> dict:
    """Return {"assignments": list[list[float]], "peakLoad": float}."""
    weights = input_data["weights"]
    compatible = input_data["compatible"]
    n_jobs = len(weights)
    n_servers = len(compatible[0])

    prob = pulp.LpProblem("minimax_load_balancing", pulp.LpMinimize)

    assignments = [
        [
            pulp.LpVariable(f"x_{i}_{j}", lowBound=0, upBound=float(compatible[i][j]))
            for j in range(n_servers)
        ]
        for i in range(n_jobs)
    ]
    peak = pulp.LpVariable("peak", lowBound=0)

    # TODO:
    # 1. Enforce full assignment for each job: sum_j assignments[i][j] == 1
    # 2. Enforce peak load cap on each server j: sum_i weights[i] * assignments[i][j] <= peak
    # 3. Minimize peak, call prob.solve(pulp.HiGHS(msg=False)),
    #    and return {"assignments": ..., "peakLoad": ...}
    raise NotImplementedError("Not implemented")
