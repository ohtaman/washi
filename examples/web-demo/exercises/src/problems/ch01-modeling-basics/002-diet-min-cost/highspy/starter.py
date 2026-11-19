import highspy


def solve(input_data: dict) -> dict:
    """Return {"oats": float, "beans": float, "totalCost": float}."""
    h = highspy.Highs()
    h.silent()

    oats = h.addVariable(lb=0.0, name="oats")
    beans = h.addVariable(lb=0.0, name="beans")

    # TODO: Add >= constraints for protein (2*oats + beans) and fiber (oats + 3*beans)

    h.minimize(30 * oats + 50 * beans)

    return {
        "oats": float(h.val(oats)),
        "beans": float(h.val(beans)),
        "totalCost": float(h.getObjectiveValue()),
    }
