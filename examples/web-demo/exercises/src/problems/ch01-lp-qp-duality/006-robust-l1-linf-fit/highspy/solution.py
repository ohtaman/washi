import highspy


def solve(input_data: dict) -> dict:
    x = input_data["x"]
    y = input_data["y"]
    linf_weight = input_data["linfWeight"]
    n = len(x)

    h = highspy.Highs()
    h.silent()

    slope = h.addVariable(lb=-highspy.kHighsInf, ub=highspy.kHighsInf, name="a")
    intercept = h.addVariable(lb=-highspy.kHighsInf, ub=highspy.kHighsInf, name="b")
    abs_err = [h.addVariable(lb=0.0, name=f"e_{i}") for i in range(n)]
    max_err = h.addVariable(lb=0.0, name="mErr")

    for i in range(n):
        residual = slope * x[i] + intercept - y[i]
        h.addConstr(abs_err[i] >= residual)
        h.addConstr(abs_err[i] >= -residual)
        h.addConstr(max_err >= abs_err[i])

    h.minimize(h.qsum(abs_err) + linf_weight * max_err)

    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    return {
        "slope": float(h.val(slope)),
        "intercept": float(h.val(intercept)),
        "objective": float(h.getObjectiveValue()),
    }
