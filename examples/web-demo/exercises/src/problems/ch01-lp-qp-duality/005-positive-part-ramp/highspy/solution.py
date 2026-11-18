import highspy


def solve(input_data: dict) -> dict:
    demands = input_data["demands"]
    max_output = input_data["maxOutput"]
    init_output = input_data["initialOutput"]
    run_cost = input_data["runCost"]
    ramp_cost = input_data["rampCost"]
    T = len(demands)

    h = highspy.Highs()
    h.silent()

    outputs = [
        h.addVariable(lb=demands[t], ub=max_output, name=f"o_{t}")
        for t in range(T)
    ]
    ramp_up = [h.addVariable(lb=0.0, name=f"u_{t}") for t in range(T)]

    for t in range(T):
        prev = init_output if t == 0 else outputs[t - 1]
        h.addConstr(ramp_up[t] >= outputs[t] - prev)

    h.minimize(run_cost * h.qsum(outputs) + ramp_cost * h.qsum(ramp_up))

    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    return {
        "outputs": [float(h.val(v)) for v in outputs],
        "totalCost": float(h.getObjectiveValue()),
    }
