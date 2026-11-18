import highspy


def solve(input_data: dict) -> dict:
    h = highspy.Highs()
    h.silent()

    c = h.addVariable(lb=0.0, name="croissants")
    l = h.addVariable(lb=0.0, name="loaves")

    h.addConstr(
        input_data["croissantFlour"] * c + input_data["loafFlour"] * l
        <= input_data["flourCap"]
    )
    h.addConstr(
        input_data["croissantButter"] * c + input_data["loafButter"] * l
        <= input_data["butterCap"]
    )

    h.maximize(input_data["croissantProfit"] * c + input_data["loafProfit"] * l)

    return {
        "croissants": float(h.val(c)),
        "loaves": float(h.val(l)),
        "totalProfit": float(h.getObjectiveValue()),
    }
