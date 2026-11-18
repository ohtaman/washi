import highspy


def solve(input_data: dict) -> dict:
    h = highspy.Highs()
    h.silent()

    # TODO: Linearize upward ramping u[t] = max(0, outputs[t] - prev),
    # minimize running + ramping cost, and return {"outputs": [...], "totalCost": ...}.
    raise NotImplementedError("Not implemented")
