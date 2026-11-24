import pulp


def solve(distances) -> dict:
    """Return {"tour": list[int], "total_distance": float, "iterations": int}."""
    n = len(distances)

    prob = pulp.LpProblem("symmetric_tsp_dfj", pulp.LpMinimize)
    # Undirected binary edge variables x[i][j] (i < j) = 1 if edge {i, j} is in the tour
    edges = {
        (i, j): pulp.LpVariable(f"x_{i}_{j}", cat=pulp.LpBinary)
        for i in range(n)
        for j in range(i + 1, n)
    }

    # Minimize total tour length subject to degree-2 constraints at every city
    prob += pulp.lpSum(distances[i][j] * var for (i, j), var in edges.items())
    for i in range(n):
        prob += pulp.lpSum(edges[(min(i, j), max(i, j))] for j in range(n) if j != i) == 2

    iterations = 0
    final_tour = []

    # Iterative DFJ cutting-plane loop: solve 2-factor relaxation, then cut off disconnected subtours
    while True:
        iterations += 1
        prob.solve(pulp.HiGHS(msg=False))

        # Reconstruct active edges using round() to handle solver tolerance
        adj = {i: [] for i in range(n)}
        for (i, j), var in edges.items():
            if round(pulp.value(var)) == 1:
                adj[i].append(j)
                adj[j].append(i)

        # Extract connected components (cycles) in the current 2-regular graph
        visited = set()
        components = []
        for start in range(n):
            if start in visited:
                continue
            comp = []
            curr, prev = start, -1
            while curr not in visited:
                visited.add(curr)
                comp.append(curr)
                nxt = [u for u in adj[curr] if u != prev][0]
                prev, curr = curr, nxt
            components.append(comp)

        # Single component means a valid Hamiltonian tour has been found
        if len(components) == 1:
            final_tour = components[0]
            break

        # Add Dantzig-Fulkerson-Johnson (DFJ) subtour elimination cuts: sum_{e in E(S)} x_e <= |S| - 1
        for comp in components:
            prob += (
                pulp.lpSum(
                    edges[(min(a, b), max(a, b))]
                    for idx_a, a in enumerate(comp)
                    for b in comp[idx_a + 1 :]
                )
                <= len(comp) - 1
            )

    return {
        "tour": final_tour,
        "total_distance": float(pulp.value(prob.objective)),
        "iterations": iterations,
    }
