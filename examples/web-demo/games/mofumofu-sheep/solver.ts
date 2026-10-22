import { Model, expr, sum, maximize, type ParsedExpr, type Var } from "../../../../src/index.js";
import {
  TILE_META,
  type CellCoord,
  type FenceGrid,
  type HintDiagnosis,
  type OptimalPastureResult,
  type PastureEvaluation,
  type StagePuzzle,
} from "./types.js";

const DIRS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function createEmptyFences(rows: number, cols: number): FenceGrid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
}

export function cloneFences(fences: FenceGrid): FenceGrid {
  return fences.map((row) => [...row]);
}

/**
 * Pure BFS evaluator for any fence placement on a stage grid.
 * Used both for real-time UI feedback and as an independent oracle to verify HiGHS solutions.
 */
export function evaluatePasture(stage: StagePuzzle, fences: FenceGrid): PastureEvaluation {
  const rows = stage.grid.length;
  const cols = stage.grid[0]?.length ?? 0;

  let fencesUsed = 0;
  const sheepStarts: CellCoord[] = [];
  const wolfStarts: CellCoord[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = stage.grid[r][c];
      if (fences[r]?.[c]) {
        fencesUsed++;
      }
      if (tile === "sheep") {
        sheepStarts.push({ row: r, col: c });
      } else if (tile === "wolf") {
        wolfStarts.push({ row: r, col: c });
      }
    }
  }

  const isPassableWithoutFence = (r: number, c: number): boolean => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    const tile = stage.grid[r][c];
    if (!TILE_META[tile].passable) return false;
    if (fences[r]?.[c]) return false;
    return true;
  };

  // 1. BFS from all sheep
  const sheepReachable: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false)
  );
  const sQueue: CellCoord[] = [];
  for (const s of sheepStarts) {
    if (isPassableWithoutFence(s.row, s.col)) {
      sheepReachable[s.row][s.col] = true;
      sQueue.push(s);
    }
  }
  let head = 0;
  while (head < sQueue.length) {
    const cur = sQueue[head++];
    for (const [dr, dc] of DIRS) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      if (isPassableWithoutFence(nr, nc) && !sheepReachable[nr][nc]) {
        sheepReachable[nr][nc] = true;
        sQueue.push({ row: nr, col: nc });
      }
    }
  }

  // 2. BFS from all wolves (and track parent pointers to reconstruct shortest breach path to any sheep)
  const wolfReachable: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false)
  );
  const parent: (CellCoord | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );
  const wQueue: CellCoord[] = [];
  for (const w of wolfStarts) {
    if (isPassableWithoutFence(w.row, w.col)) {
      wolfReachable[w.row][w.col] = true;
      wQueue.push(w);
    }
  }

  let reachedSheepCell: CellCoord | null = null;
  head = 0;
  while (head < wQueue.length) {
    const cur = wQueue[head++];
    if (stage.grid[cur.row][cur.col] === "sheep" && reachedSheepCell === null) {
      reachedSheepCell = cur;
    }
    for (const [dr, dc] of DIRS) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      if (isPassableWithoutFence(nr, nc) && !wolfReachable[nr][nc]) {
        wolfReachable[nr][nc] = true;
        parent[nr][nc] = cur;
        wQueue.push({ row: nr, col: nc });
      }
    }
  }

  const breachPath: CellCoord[] = [];
  if (reachedSheepCell) {
    let curr: CellCoord | null = reachedSheepCell;
    while (curr) {
      breachPath.push(curr);
      curr = parent[curr.row][curr.col];
    }
    breachPath.reverse();
  }

  let pastureScore = 0;
  let pastureTileCount = 0;
  const breakdown = {
    sheepCount: 0,
    grassCount: 0,
    strawberryCount: 0,
    mushroomCount: 0,
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!sheepReachable[r][c]) continue;
      pastureTileCount++;
      const tile = stage.grid[r][c];
      pastureScore += TILE_META[tile].score;
      if (tile === "sheep") breakdown.sheepCount++;
      else if (tile === "grass" || tile === "bridge") breakdown.grassCount++;
      else if (tile === "strawberry") breakdown.strawberryCount++;
      else if (tile === "mushroom") breakdown.mushroomCount++;
    }
  }

  const isOverBudget = fencesUsed > stage.maxFences;
  const isSafe = breachPath.length === 0 && !isOverBudget && sheepStarts.length > 0;

  return {
    isSafe,
    isOverBudget,
    fencesUsed,
    maxFences: stage.maxFences,
    pastureScore,
    pastureTileCount,
    breakdown,
    sheepReachable,
    wolfReachable,
    breachPath,
  };
}

/**
 * Formulates the Sheep Pasture Enclosure & Maximum Weight Connected Subgraph problem as a MILP
 * and solves it to proven optimality using HiGHS:
 *
 * - Binary `fence[r][c]`: 1 if a wooden fence is placed on cell (r, c).
 * - Binary `reach[r][c]`: 1 if cell (r, c) is inside the sheep's enclosed pasture.
 * - Continuous `flow[u -> v]`: single-commodity network flow from sheep cells ensuring that
 *   `reach[r][c] = 1` holds if and only if (r, c) is genuinely connected to at least one sheep.
 * - Flood / Cut constraint: `reach[u] <= reach[v] + fence[v]` for all adjacent passable (u, v),
 *   with `reach[sheep] = 1` and `reach[wolf] = 0`.
 */
export async function solveOptimalPasture(
  stage: StagePuzzle,
  requiredFences: readonly CellCoord[] = []
): Promise<OptimalPastureResult> {
  const startTime = performance.now();
  const rows = stage.grid.length;
  const cols = stage.grid[0]?.length ?? 0;

  const model = new Model(`MofumofuSheep_${stage.id}`, { solver: "highs" });

  const fenceVars: (Var | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );
  const reachVars: (Var | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );

  let passableCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = stage.grid[r][c];
      if (TILE_META[tile].passable) {
        passableCount++;
      }
    }
  }
  const maxFlowM = Math.max(1, passableCount);

  const allFenceVars: Var[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = stage.grid[r][c];
      const meta = TILE_META[tile];
      if (!meta.passable) continue;

      const rVar = model.binary(`reach_${r}_${c}`);
      reachVars[r][c] = rVar;

      if (meta.canPlaceFence) {
        const fVar = model.binary(`fence_${r}_${c}`);
        fenceVars[r][c] = fVar;
        allFenceVars.push(fVar);
        // A cell with a fence cannot be part of the reachable pasture
        model.constraint(expr`${rVar} + ${fVar} <= 1`, `excl_${r}_${c}`);
      }

      if (tile === "sheep") {
        model.constraint(expr`${rVar} == 1`, `sheep_${r}_${c}`);
      } else if (tile === "wolf") {
        model.constraint(expr`${rVar} == 0`, `wolf_${r}_${c}`);
      }
    }
  }

  // Honor any locked-in fences (used by the interactive hint / diagnosis engine)
  for (const cell of requiredFences) {
    const fVar = fenceVars[cell.row]?.[cell.col];
    if (fVar) {
      model.constraint(expr`${fVar} == 1`, `req_fence_${cell.row}_${cell.col}`);
    }
  }

  // Fence budget constraint
  if (allFenceVars.length > 0) {
    model.constraint(expr`${sum(allFenceVars)} <= ${stage.maxFences}`, "fence_budget");
  }

  // Directed flow variables for each ordered pair of adjacent passable cells (u -> v)
  const incomingFlows: Var[][][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => [])
  );
  const outgoingFlows: Var[][][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => [])
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const uReach = reachVars[r][c];
      if (!uReach) continue;

      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const vReach = reachVars[nr][nc];
        if (!vReach) continue;

        const vFence = fenceVars[nr][nc];
        // 1. Flood / Cut constraint: if u is reachable by sheep and v has no fence, v MUST be reachable
        if (vFence) {
          model.constraint(
            expr`${uReach} - ${vReach} - ${vFence} <= 0`,
            `flood_${r}_${c}_to_${nr}_${nc}`
          );
        } else {
          model.constraint(expr`${uReach} - ${vReach} <= 0`, `flood_${r}_${c}_to_${nr}_${nc}`);
        }

        // 2. Single-commodity connectivity flow u -> v (only active if both u and v are reachable)
        const flowUV = model.continuous(`flow_${r}_${c}_to_${nr}_${nc}`, {
          lb: 0,
          ub: maxFlowM,
        });
        model.constraint(
          expr`${flowUV} - ${maxFlowM} * ${uReach} <= 0`,
          `fub_u_${r}_${c}_${nr}_${nc}`
        );
        model.constraint(
          expr`${flowUV} - ${maxFlowM} * ${vReach} <= 0`,
          `fub_v_${r}_${c}_${nr}_${nc}`
        );

        outgoingFlows[r][c].push(flowUV);
        incomingFlows[nr][nc].push(flowUV);
      }
    }
  }

  // Flow conservation on every non-sheep passable cell: inflow - outflow == reach[r][c]
  // This prevents disconnected pockets outside the fence from setting reach[r][c] = 1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rVar = reachVars[r][c];
      if (!rVar) continue;
      if (stage.grid[r][c] === "sheep") continue;

      const inList = incomingFlows[r][c];
      const outList = outgoingFlows[r][c];
      if (inList.length === 0) {
        model.constraint(expr`${rVar} == 0`, `fcons_${r}_${c}`);
      } else if (outList.length === 0) {
        model.constraint(expr`${sum(inList)} - ${rVar} == 0`, `fcons_${r}_${c}`);
      } else {
        model.constraint(
          expr`${sum(inList)} - ${sum(outList)} - ${rVar} == 0`,
          `fcons_${r}_${c}`
        );
      }
    }
  }

  // Objective: Maximize 100 * (total pasture score) - 1 * (number of fences used)
  // Multiplying tile scores by 100 ensures pasture score is strictly prioritized, while using fewer fences is a clean tie-breaker.
  const objectiveTerms: ParsedExpr[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rVar = reachVars[r][c];
      if (rVar) {
        const tileScore = TILE_META[stage.grid[r][c]].score;
        if (tileScore !== 0) {
          objectiveTerms.push(expr`${tileScore * 100} * ${rVar}`);
        }
      }
      const fVar = fenceVars[r][c];
      if (fVar) {
        objectiveTerms.push(expr`-1 * ${fVar}`);
      }
    }
  }

  model.objective(maximize(sum(objectiveTerms)));

  const status = await model.solve({ presolve: "off" });
  const solveTimeMs = Math.max(1, Math.round(performance.now() - startTime));

  if (status !== "Optimal" && !model.hasPrimalSolution) {
    const empty = createEmptyFences(rows, cols);
    return {
      status: status === "Infeasible" ? "Infeasible" : "Error",
      optimalFences: empty,
      optimalScore: 0,
      optimalFenceCount: 0,
      optimalEvaluation: evaluatePasture(stage, empty),
      solveTimeMs,
      verified: false,
    };
  }

  const optimalFences = createEmptyFences(rows, cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fVar = fenceVars[r][c];
      if (fVar && Math.round(fVar.value ?? 0) === 1) {
        optimalFences[r][c] = true;
      }
    }
  }

  const optimalEvaluation = evaluatePasture(stage, optimalFences);
  const report = model.validateSolution();
  const verified = report.valid && optimalEvaluation.isSafe && !optimalEvaluation.isOverBudget;

  return {
    status: status === "Optimal" ? "Optimal" : "Feasible",
    optimalFences,
    optimalScore: optimalEvaluation.pastureScore,
    optimalFenceCount: optimalEvaluation.fencesUsed,
    optimalEvaluation,
    solveTimeMs,
    verified,
  };
}

/**
 * Interactive HiGHS Hint & Mistake Diagnosis Engine:
 * Checks whether the player's currently placed fences can still be completed to an Optimal (★3) pasture,
 * or identifies which placed fence is preventing an optimal/safe enclosure.
 */
export async function diagnoseAndSuggestFenceHint(
  stage: StagePuzzle,
  currentFences: FenceGrid,
  cachedOptimal?: OptimalPastureResult | null
): Promise<HintDiagnosis> {
  const baseOpt = cachedOptimal ?? (await solveOptimalPasture(stage));
  const rows = stage.grid.length;
  const cols = stage.grid[0]?.length ?? 0;

  const placedCells: CellCoord[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (currentFences[r]?.[c]) {
        placedCells.push({ row: r, col: c });
      }
    }
  }

  // Case 1: Over budget — tell the player to remove a fence that isn't in the optimal solution
  if (placedCells.length > stage.maxFences) {
    const extraCell =
      placedCells.find((c) => !baseOpt.optimalFences[c.row]?.[c.col]) ?? placedCells[0];
    return {
      status: "bad_fence_placed",
      targetCell: extraCell,
      action: "remove",
    };
  }

  // Solve with all currently placed fences locked in
  const lockedSolve = await solveOptimalPasture(stage, placedCells);

  if (
    lockedSolve.status === "Optimal" &&
    lockedSolve.verified &&
    lockedSolve.optimalScore >= baseOpt.optimalScore
  ) {
    // Player is on a valid track to the ★3 optimal score! Find a missing fence from lockedSolve.optimalFences
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (lockedSolve.optimalFences[r][c] && !currentFences[r][c]) {
          return {
            status: "can_achieve_optimal",
            targetCell: { row: r, col: c },
            action: "place",
          };
        }
      }
    }
    return {
      status: "can_achieve_optimal",
      targetCell: null,
      action: "place",
    };
  }

  // Otherwise, at least one currently placed fence prevents reaching the ★3 optimal score (or makes it infeasible)
  const culprit =
    placedCells.find((c) => !baseOpt.optimalFences[c.row]?.[c.col]) ?? placedCells[0] ?? null;

  if (culprit) {
    return {
      status:
        lockedSolve.status === "Optimal" && lockedSolve.verified
          ? "can_achieve_safe_only"
          : "bad_fence_placed",
      targetCell: culprit,
      action: "remove",
    };
  }

  // Fallback if no fences placed yet
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (baseOpt.optimalFences[r][c]) {
        return {
          status: "can_achieve_optimal",
          targetCell: { row: r, col: c },
          action: "place",
        };
      }
    }
  }

  return {
    status: "can_achieve_optimal",
    targetCell: null,
    action: "place",
  };
}
