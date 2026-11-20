import math
import pulp


def solve(input_data: dict) -> dict:
    """Return {"assignments": list[int], "binsUsed": int, "lpBound": float}."""
    weights = input_data["weights"]
    bin_cap = input_data["binCapacity"]
    n = len(weights)

    # TODO:
    # 1. Build both LP relaxation (LpContinuous in [0, 1]) and MIP (LpBinary)
    # 2. Add assignment, bin capacity, symmetry breaking (used[k] >= used[k+1], assign[i][k] == 0 for k > i),
    #    global capacity cut sum(used) >= ceil(sum(weights) / bin_cap),
    #    and extended minimal cover cuts sum_{i in E(C)} assign[i][k] <= (|C| - 1) * used[k]
    # 3. Solve with pulp.HiGHS(msg=False) and return {"assignments": ..., "binsUsed": ..., "lpBound": ...}
    raise NotImplementedError("Not implemented")
