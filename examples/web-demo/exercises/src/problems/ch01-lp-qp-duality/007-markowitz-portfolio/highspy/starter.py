import highspy


def solve(input_data: dict) -> dict:
    h = highspy.Highs()
    h.silent()

    # TODO: Add budget and return constraints, pass Q = 2 * covariance via HighsHessian
    # (CSC lower triangle) and h.run(), then return {"weights": [...], "variance": ...}.
    raise NotImplementedError("Not implemented")
