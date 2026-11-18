import highspy


def solve(input_data: dict) -> dict:
    h = highspy.Highs()
    h.silent()

    # TODO: Solve the joint LP over base + candidate products, extract shadowPrices
    # (sol.row_dual) and candidate reduced costs (sol.col_dual),
    # and return {baseQuantities, candidateQuantities, optimalProfit, shadowPrices, candidateReducedCosts, minMarginIncreaseNeeded}.
    raise NotImplementedError("Not implemented")
