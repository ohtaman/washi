import highspy


def solve(input_data: dict) -> dict:
    loads = input_data["loads"]
    capacities = input_data["capacities"]
    allowed = input_data["allowed"]
    n_jobs = len(loads)
    n_servers = len(capacities)

    h = highspy.Highs()
    h.silent()

    x = [
        [
            h.addVariable(lb=0.0, ub=float(allowed[j][s]), name=f"x_{j}_{s}")
            for s in range(n_servers)
        ]
        for j in range(n_jobs)
    ]
    peak = h.addVariable(lb=0.0, name="peak")

    for j in range(n_jobs):
        h.addConstr(h.qsum(x[j]) == 1.0)

    for s in range(n_servers):
        h.addConstr(
            h.qsum(loads[j] * x[j][s] for j in range(n_jobs)) <= capacities[s] * peak
        )

    h.minimize(peak)

    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    return {
        "assignments": [[float(h.val(x[j][s])) for s in range(n_servers)] for j in range(n_jobs)],
        "peakUtilization": float(h.getObjectiveValue()),
    }
