import highspy


def solve(input_data: dict) -> dict:
    h = highspy.Highs()
    h.silent()

    # TODO: Add resource constraints keeping references, maximize profit,
    # read sol = h.getSolution() for row_dual and slack,
    # and return {quantities, optimalProfit, shadowPrices, slacks, isBottleneck}.
    raise NotImplementedError("Not implemented")
