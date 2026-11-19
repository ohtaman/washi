import highspy


def solve(input_data: dict) -> dict:
    """Return {"croissants": float, "loaves": float, "totalProfit": float}."""
    h = highspy.Highs()
    h.silent()

    c = h.addVariable(lb=0.0, name="croissants")
    l = h.addVariable(lb=0.0, name="loaves")

    h.addConstr(2 * c + 3 * l <= input_data["flourCap"])
    h.addConstr(c + 2 * l <= input_data["butterCap"])

    h.maximize(40 * c + 70 * l)

    return {
        "croissants": float(h.val(c)),
        "loaves": float(h.val(l)),
        "totalProfit": float(h.getObjectiveValue()),
    }
