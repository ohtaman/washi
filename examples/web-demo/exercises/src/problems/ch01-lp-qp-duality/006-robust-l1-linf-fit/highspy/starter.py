import highspy


def solve(input_data: dict) -> dict:
    h = highspy.Highs()
    h.silent()

    # TODO: Declare free slope & intercept with lb=-highspy.kHighsInf, ub=highspy.kHighsInf,
    # linearize |a*x_i + b - y_i| and max_i |a*x_i + b - y_i|,
    # and return {"slope": ..., "intercept": ..., "objective": ...}.
    raise NotImplementedError("Not implemented")
