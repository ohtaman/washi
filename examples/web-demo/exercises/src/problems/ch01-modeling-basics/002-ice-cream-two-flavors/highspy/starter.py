import highspy


def solve(input_data: dict) -> dict:
    """Return {"vanilla": float, "chocolate": float, "totalProfit": float}."""
    h = highspy.Highs()
    h.silent()

    vanilla = h.addVariable(lb=0.0, name="vanilla")
    chocolate = h.addVariable(lb=0.0, name="chocolate")

    h.addConstr(
        input_data["vanillaMilk"] * vanilla + input_data["chocoMilk"] * chocolate
        <= input_data["milkCap"]
    )

    # TODO: Add the sugar capacity constraint <= input_data["sugarCap"]

    h.maximize(
        input_data["vanillaProfit"] * vanilla + input_data["chocoProfit"] * chocolate
    )

    return {
        "vanilla": float(h.val(vanilla)),
        "chocolate": float(h.val(chocolate)),
        "totalProfit": float(h.getObjectiveValue()),
    }
