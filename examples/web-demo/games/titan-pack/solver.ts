import { Model, sum, type SolveStatus, type Var } from "../../../../src/index.js";
import type { PuzzleResult } from "./generator.js";

export interface TitanPlacement {
  partId: string;
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface TitanSolveResult {
  status: SolveStatus;
  placements: TitanPlacement[];
  solveTimeMs: number;
  verified: boolean;
  maxViolation: number;
}

/**
 * Solves a 2D exact-cover / strip-packing TITAN PACK puzzle using WaSHI (HiGHS MILP).
 * Supports 90-degree part rotation and partial locked placements, and verifies
 * the resulting solution with `model.verify()`.
 */
export async function solveTitanPack(
  puzzle: Pick<PuzzleResult, "cols" | "rows" | "parts">,
  lockedPlacements: readonly TitanPlacement[] = []
): Promise<TitanSolveResult> {
  const startTime = performance.now();
  const { cols, rows, parts } = puzzle;

  const infeasibleResult = (): TitanSolveResult => ({
    status: "Infeasible",
    placements: [],
    solveTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
    verified: false,
    maxViolation: Number.POSITIVE_INFINITY,
  });

  const partsById = new Map(parts.map((p) => [p.id, p]));
  const lockedByPartId = new Map<string, TitanPlacement>();
  const lockedOccupied: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false)
  );

  for (const locked of lockedPlacements) {
    if (lockedByPartId.has(locked.partId)) {
      return infeasibleResult();
    }
    const part = partsById.get(locked.partId);
    if (!part) {
      return infeasibleResult();
    }
    const matchesOriginal = locked.w === part.origW && locked.h === part.origH;
    const matchesRotated = locked.w === part.origH && locked.h === part.origW;
    if (!matchesOriginal && !matchesRotated) {
      return infeasibleResult();
    }
    if (
      !Number.isInteger(locked.col) ||
      !Number.isInteger(locked.row) ||
      locked.col < 0 ||
      locked.row < 0 ||
      locked.col + locked.w > cols ||
      locked.row + locked.h > rows
    ) {
      return infeasibleResult();
    }
    for (let r = locked.row; r < locked.row + locked.h; r++) {
      for (let c = locked.col; c < locked.col + locked.w; c++) {
        if (lockedOccupied[r][c]) {
          return infeasibleResult();
        }
        lockedOccupied[r][c] = true;
      }
    }
    lockedByPartId.set(locked.partId, locked);
  }

  const totalPartsArea = parts.reduce((acc, p) => acc + p.origW * p.origH, 0);
  const totalBoardArea = cols * rows;
  if (totalPartsArea > totalBoardArea) {
    return infeasibleResult();
  }

  const model = new Model("TitanPack2D");
  const cellVars: Var[][][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => [])
  );
  const allPartVars: Array<{ var: Var; placement: TitanPlacement }> = [];

  for (const part of parts) {
    const partVars: Array<{ var: Var; placement: TitanPlacement }> = [];
    const locked = lockedByPartId.get(part.id);

    if (locked) {
      const v = model.binary(
        `x_${part.id}_${locked.col}_${locked.row}_${locked.w}x${locked.h}`
      );
      const entry = { var: v, placement: { ...locked } };
      partVars.push(entry);
      allPartVars.push(entry);
      for (let r = locked.row; r < locked.row + locked.h; r++) {
        for (let c = locked.col; c < locked.col + locked.w; c++) {
          cellVars[r][c].push(v);
        }
      }
    } else {
      const orientations: Array<[number, number]> = [[part.origW, part.origH]];
      if (part.origW !== part.origH) {
        orientations.push([part.origH, part.origW]);
      }

      for (const [w, h] of orientations) {
        if (w > cols || h > rows) continue;
        for (let row = 0; row <= rows - h; row++) {
          for (let col = 0; col <= cols - w; col++) {
            let collidesWithLocked = false;
            for (let r = row; r < row + h && !collidesWithLocked; r++) {
              for (let c = col; c < col + w; c++) {
                if (lockedOccupied[r][c]) {
                  collidesWithLocked = true;
                  break;
                }
              }
            }
            if (collidesWithLocked) continue;

            const v = model.binary(`x_${part.id}_${col}_${row}_${w}x${h}`);
            const placement: TitanPlacement = { partId: part.id, col, row, w, h };
            const entry = { var: v, placement };
            partVars.push(entry);
            allPartVars.push(entry);
            for (let r = row; r < row + h; r++) {
              for (let c = col; c < col + w; c++) {
                cellVars[r][c].push(v);
              }
            }
          }
        }
      }
    }

    if (partVars.length === 0) {
      return infeasibleResult();
    }
    model.constraint(sum(partVars.map((pv) => pv.var)).eq(1));
  }

  const isExactCover = totalPartsArea === totalBoardArea;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const vars = cellVars[r][c];
      if (vars.length === 0) {
        if (isExactCover) {
          return infeasibleResult();
        }
        continue;
      }
      if (isExactCover) {
        model.constraint(sum(vars).eq(1));
      } else {
        model.constraint(sum(vars).le(1));
      }
    }
  }

  const status = await model.solve({ solver: "highs" });
  const solveTimeMs = Math.max(1, Math.round(performance.now() - startTime));
  const report = model.verify();

  const placements: TitanPlacement[] = [];
  if (status === "Optimal" && report.valid) {
    for (const pv of allPartVars) {
      if ((pv.var.value ?? 0) > 0.5) {
        placements.push(pv.placement);
      }
    }
  }

  return {
    status,
    placements,
    solveTimeMs,
    verified: status === "Optimal" && report.valid,
    maxViolation: report.maxViolation,
  };
}
