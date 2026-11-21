import math
import pulp


def _build_extended_covers(weights: list, bin_cap: int) -> list:
    cuts = []
    seen = set()
    n = len(weights)

    def dfs(start: int, cur: list, sum_w: int, min_w: int, max_w: int):
        if sum_w > bin_cap:
            if sum_w - min_w <= bin_cap:
                ext = tuple(j for j in range(n) if j in cur or weights[j] >= max_w)
                key = (ext, len(cur) - 1)
                if key not in seen:
                    seen.add(key)
                    cuts.append((ext, len(cur) - 1))
            return
        for nxt in range(start, n):
            cur.append(nxt)
            dfs(nxt + 1, cur, sum_w + weights[nxt], min(min_w, weights[nxt]), max(max_w, weights[nxt]))
            cur.pop()

    dfs(0, [], 0, float("inf"), 0)
    return cuts


def _solve_bpp(weights: list, bin_cap: int, covers: list, relax: bool):
    n = len(weights)
    prob = pulp.LpProblem("bpp_cuts", pulp.LpMinimize)
    cat = pulp.LpContinuous if relax else pulp.LpBinary
    used = [pulp.LpVariable(f"used_{k}", 0, 1, cat=cat) for k in range(n)]
    assign = [[pulp.LpVariable(f"x_{i}_{k}", 0, 1, cat=cat) for k in range(n)] for i in range(n)]

    prob += pulp.lpSum(used)
    for i in range(n):
        prob += pulp.lpSum(assign[i][k] for k in range(n)) == 1
        for k in range(i + 1, n):
            prob += assign[i][k] == 0

    for k in range(n):
        prob += pulp.lpSum(weights[i] * assign[i][k] for i in range(n)) <= bin_cap * used[k]
    for k in range(n - 1):
        prob += used[k] >= used[k + 1]

    prob += pulp.lpSum(used) >= math.ceil(sum(weights) / bin_cap)
    for ext, rhs_mult in covers:
        for k in range(n):
            prob += pulp.lpSum(assign[i][k] for i in ext) <= rhs_mult * used[k]

    prob.solve(pulp.HiGHS(msg=False))
    return prob, used, assign


def solve(weights, binCapacity) -> dict:
    """Return {"assignments": list[int], "binsUsed": int, "lpBound": float}."""
    bin_cap = binCapacity
    n = len(weights)
    covers = _build_extended_covers(weights, bin_cap)

    lp_prob, _, _ = _solve_bpp(weights, bin_cap, covers, relax=True)
    mip_prob, used, assign = _solve_bpp(weights, bin_cap, covers, relax=False)

    assignments = [
        next(k for k in range(n) if round(pulp.value(assign[i][k])) == 1)
        for i in range(n)
    ]
    return {
        "assignments": assignments,
        "binsUsed": round(pulp.value(mip_prob.objective)),
        "lpBound": float(pulp.value(lp_prob.objective)),
    }
