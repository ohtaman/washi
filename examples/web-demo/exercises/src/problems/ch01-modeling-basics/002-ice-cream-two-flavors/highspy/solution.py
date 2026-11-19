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
    h.addConstr(
        input_data["vanillaSugar"] * vanilla + input_data["chocoSugar"] * chocolate
        <= input_data["sugarCap"]
    )

    h.maximize(
        input_data["vanillaProfit"] * vanilla + input_data["chocoProfit"] * chocolate
    )

    status = h.modelStatusToString(h.getModelStatus())
    if status != "Optimal":
        raise RuntimeError(f"Expected Optimal, got {status}")

    return {
        "vanilla": float(h.val(vanilla)),
        "chocolate": float(h.val(chocolate)),
        "totalProfit": float(h.getObjectiveValue()),
    }
