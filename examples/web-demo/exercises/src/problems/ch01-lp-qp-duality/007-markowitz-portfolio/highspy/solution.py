import highspy


def solve(input_data: dict) -> dict:
    returns = input_data["expectedReturns"]
    cov = input_data["covariance"]
    max_w = input_data["maxWeights"]
    min_ret = input_data["minReturn"]
    n = len(returns)

    h = highspy.Highs()
    h.silent()

    weights = [h.addVariable(lb=0.0, ub=max_w[i], name=f"w_{i}") for i in range(n)]
    h.addConstr(h.qsum(weights) == 1.0)
    h.addConstr(h.qsum(returns[i] * weights[i] for i in range(n)) >= min_ret)

    # HiGHS minimizes (1/2) * x^T Q x, so pass Q = 2 * cov (lower triangle in CSC)
    hess = highspy.HighsHessian()
    hess.dim_ = n
    hess.format_ = highspy.HessianFormat.kTriangular
    starts = [0]
    indices = []
    values = []
    for c in range(n):
        for r in range(c, n):
            q_val = 2.0 * cov[r][c]
            if q_val != 0.0:
                indices.append(r)
                values.append(q_val)
        starts.append(len(indices))
    hess.start_ = starts
    hess.index_ = indices
    hess.value_ = values
    h.passHessian(hess)

    h.run()
    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    return {
        "weights": [float(h.val(v)) for v in weights],
        "variance": float(h.getObjectiveValue()),
    }
