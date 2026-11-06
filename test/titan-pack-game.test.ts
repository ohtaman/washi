import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { Model } from "../src/index.js";
import {
  checkBoardCoverage,
  computeTitanCellSize,
  generateStagePuzzle,
  getStageSpec,
  hasFaultLines,
  mulberry32,
  removeCollidingBlocks,
  type PlacedBlock,
} from "../examples/web-demo/games/titan-pack/generator.ts";

describe("TITAN PACK: 2D Cutting Stock & Interlocking Puzzle Generator", () => {
  it("generates deterministic pseudo-random sequences for mulberry32", () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32(12345);
    for (let i = 0; i < 20; i++) {
      expect(rng1()).toBeCloseTo(rng2(), 10);
    }
  });

  it("detects fault lines accurately", () => {
    // 4x4 grid split down the middle at c=2 (continuous vertical cut)
    const blocksWithFault: PlacedBlock[] = [
      { col: 0, row: 0, w: 2, h: 4 },
      { col: 2, row: 0, w: 2, h: 4 },
    ];
    expect(hasFaultLines(4, 4, blocksWithFault)).toBe(true);

    // 4x4 pinwheel with no continuous fault line
    const blocksWithoutFault: PlacedBlock[] = [
      { col: 0, row: 0, w: 3, h: 1 },
      { col: 3, row: 0, w: 1, h: 3 },
      { col: 1, row: 3, w: 3, h: 1 },
      { col: 0, row: 1, w: 1, h: 3 },
      { col: 1, row: 1, w: 2, h: 2 },
    ];
    expect(hasFaultLines(4, 4, blocksWithoutFault)).toBe(false);
  });

  it("provides balanced level progression specs across all worlds", () => {
    // World 1 (Apprentice): 6x4 ~ 7x5
    const w1s1 = getStageSpec(1);
    expect(w1s1.world).toBe(1);
    expect(w1s1.cols).toBe(6);
    expect(w1s1.rows).toBe(4);
    expect(w1s1.targetPieces).toBe(5);

    // World 2 (Craftsman): 8x5 ~ 9x6
    const w2s3 = getStageSpec(3);
    expect(w2s3.world).toBe(2);
    expect(w2s3.cols).toBe(8);
    expect(w2s3.rows).toBe(5);

    // World 3 (Master): 9x7 ~ 10x8
    const w3s7 = getStageSpec(7);
    expect(w3s7.world).toBe(3);
    expect(w3s7.cols).toBe(10);
    expect(w3s7.rows).toBe(7);

    // World 4 (Legend): 11x8 ~ 12x8
    const w4s10 = getStageSpec(10);
    expect(w4s10.world).toBe(4);
    expect(w4s10.cols).toBe(12);
    expect(w4s10.rows).toBe(8);

    // World 5 (Endless Challenge)
    const endless = getStageSpec(15);
    expect(endless.world).toBe(5);
    expect(endless.cols).toBeGreaterThanOrEqual(12);
    expect(endless.cols).toBeLessThanOrEqual(14);
  });

  for (let s = 1; s <= 15; s++) {
    it(`verifies puzzle mathematical integrity for Stage ${s}`, () => {
      const puzzle = generateStagePuzzle(s);
      const { cols, rows, parts, solution, spec } = puzzle;
      const totalBoardArea = cols * rows;

      // 1. Solution parts count matches inventory parts count and matches targetPieces
      expect(parts.length).toBe(spec.targetPieces);
      expect(solution.length).toBe(parts.length);

      // 2. Exact zero scrap: total parts area must equal total board area
      const totalPartsArea = parts.reduce((sum, p) => sum + p.origW * p.origH, 0);
      expect(totalPartsArea).toBe(totalBoardArea);

      const totalSolutionArea = solution.reduce((sum, p) => sum + p.w * p.h, 0);
      expect(totalSolutionArea).toBe(totalBoardArea);

      // 3. Every solution block lies strictly within the matrix boundaries
      for (const b of solution) {
        expect(b.col).toBeGreaterThanOrEqual(0);
        expect(b.row).toBeGreaterThanOrEqual(0);
        expect(b.col + b.w).toBeLessThanOrEqual(cols);
        expect(b.row + b.h).toBeLessThanOrEqual(rows);
      }

      // 4. No overlapping blocks in solution (Pairwise disjoint)
      for (let i = 0; i < solution.length; i++) {
        for (let j = i + 1; j < solution.length; j++) {
          const b1 = solution[i];
          const b2 = solution[j];
          const overlapX = Math.max(0, Math.min(b1.col + b1.w, b2.col + b2.w) - Math.max(b1.col, b2.col));
          const overlapY = Math.max(0, Math.min(b1.row + b1.h, b2.row + b2.h) - Math.max(b1.row, b2.row));
          expect(overlapX === 0 || overlapY === 0).toBe(true);
        }
      }

      // 5. Fault-line free guarantee
      const hasFault = hasFaultLines(cols, rows, solution);
      expect(hasFault).toBe(false);

      // 6. Each inventory part matches a corresponding solution block (possibly rotated)
      for (const b of solution) {
        const part = parts.find((p) => p.id === b.partId);
        expect(part).toBeDefined();
        const matchesOriginal = part!.origW === b.w && part!.origH === b.h;
        const matchesRotated = part!.origW === b.h && part!.origH === b.w;
        expect(matchesOriginal || matchesRotated).toBe(true);
      }

      // 7. Determinism: Regenerating with same stageNum yields identical puzzle
      const puzzleAgain = generateStagePuzzle(s);
      expect(puzzleAgain.solution).toEqual(puzzle.solution);
      expect(puzzleAgain.parts.map((p) => p.id)).toEqual(puzzle.parts.map((p) => p.id));
    });
  }

  it("formulates and solves 2D packing with public Washi MILP API with HiGHS", async () => {
    const puzzle = generateStagePuzzle(1);
    const { cols: plateW, rows: plateH, parts } = puzzle;
    const m = new Model("TitanPacking2D");
    const M = Math.max(plateW, plateH) + 1;

    // Fixed orientation coordinates for validation
    const x = parts.map((p, i) => m.continuous(`x_${i}`, { lb: 0, ub: plateW - p.origW }));
    const y = parts.map((p, i) => m.continuous(`y_${i}`, { lb: 0, ub: plateH - p.origH }));

    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const d1 = m.binary(`d_${i}_${j}_left`);
        const d2 = m.binary(`d_${i}_${j}_right`);
        const d3 = m.binary(`d_${i}_${j}_below`);
        const d4 = m.binary(`d_${i}_${j}_above`);

        m.constraint(x[i].add(parts[i].origW).sub(x[j]).add(d1.mul(M)).le(M));
        m.constraint(x[j].add(parts[j].origW).sub(x[i]).add(d2.mul(M)).le(M));
        m.constraint(y[i].add(parts[i].origH).sub(y[j]).add(d3.mul(M)).le(M));
        m.constraint(y[j].add(parts[j].origH).sub(y[i]).add(d4.mul(M)).le(M));
        m.constraint(d1.add(d2).add(d3).add(d4).ge(1));
      }
    }

    const status = await m.solve({ solver: "highs" });
    expect(status).toBe("Optimal");
  });

  describe("Mobile & Touch Responsiveness", () => {
    it("dynamically computes cell sizes that prevent horizontal overflow on narrow mobile screens (375px)", () => {
      // 375px mobile device: availableWidth ~ 310px after layout margins & panel padding
      const mobileAvailW = 310;
      const mobileAvailH = 340;
      const stagesToCheck = [1, 4, 7, 10, 20];

      for (const stage of stagesToCheck) {
        const spec = getStageSpec(stage);
        const cellSize = computeTitanCellSize(spec.cols, spec.rows, mobileAvailW, mobileAvailH, 20);

        // 1. Minimum cell size is at least 18px for tap readability and touch accessibility
        expect(cellSize).toBeGreaterThanOrEqual(18);

        // 2. Maximum cell size never exceeds 54px
        expect(cellSize).toBeLessThanOrEqual(54);

        // 3. Mathematical zero-overflow guarantee: board width (cols * cellSize + padding) fits in availableWidth
        const plateTotalWidth = spec.cols * cellSize + 20;
        expect(plateTotalWidth).toBeLessThanOrEqual(mobileAvailW);
      }
    });

    it("clamps cell sizes properly under extreme viewport boundaries", () => {
      // Extremely large screen (4K desktop 3840px): max clamp 54px
      const desktopLarge = computeTitanCellSize(6, 4, 2000, 1600);
      expect(desktopLarge).toBe(54);

      // Extremely tiny screen (240px watch or folded display): min clamp 18px
      const tinyWatch = computeTitanCellSize(14, 9, 200, 200);
      expect(tinyWatch).toBe(18);
    });

    it("verifies mobile HTML and CSS accessibility and viewport integration in index.html", () => {
      const htmlPath = path.resolve(__dirname, "../examples/web-demo/games/titan-pack/index.html");
      const html = fs.readFileSync(htmlPath, "utf-8");

      // 1. Mobile viewport and safe-area adjustments
      expect(html).toContain("min-height: 100dvh");
      expect(html).toContain("env(safe-area-inset-bottom)");
      expect(html).toContain("touch-action: manipulation");

      // 2. Responsive breakpoints
      expect(html).toContain("@media (max-width: 860px)");
      expect(html).toContain("@media (max-width: 640px)");

      // 3. Touch target sizing (min 44px for accessibility on cards/buttons)
      expect(html).toContain("min-height: 44px");

      // 4. Mobile compact grid inventory tray (eliminates horizontal scrolling)
      expect(html).toContain("repeat(auto-fit, minmax(54px, 1fr))");

      // 5. Dedicated active part controls for mobile
      expect(html).toContain("id=\"active-banner\"");
      expect(html).toContain("id=\"btn-active-rotate\"");
      expect(html).toContain("id=\"btn-active-cancel\"");
      expect(html).toContain("class=\"footbar-actions\"");

      // 6. Mobile header clutter reduction & theory button removal
      expect(html).toContain("#btn-theory");
      expect(html).toContain("display: none !important");
      expect(html).toContain("position: sticky");

      // 6. Dynamic updateCellSize on resize and orientationchange
      const mainTsPath = path.resolve(__dirname, "../examples/web-demo/games/titan-pack/main.ts");
      const clientCode = html + (fs.existsSync(mainTsPath) ? fs.readFileSync(mainTsPath, "utf-8") : "");
      expect(clientCode).toContain("window.addEventListener(\"resize\", updateCellSize)");
      expect(clientCode).toContain("window.addEventListener(\"orientationchange\", updateCellSize)");
    });
  });

  describe("Hint Resolution & Board Coverage Integrity (Codex Review Regression)", () => {
    it("resolves conflicting manual placements when a hint is requested", () => {
      const puzzle = generateStagePuzzle(1);
      // Stage 1 blueprint solution block 0: Part A at (0, 0) with w=4, h=1
      const solA = puzzle.solution.find((s) => s.partId === "part-0") ?? puzzle.solution[0];

      // Simulate player placing another part B at (3, 0) with w=2, h=3 (which overlaps col 3, row 0 of A)
      let placed: Array<PlacedBlock & { partId: string }> = [
        { partId: "part-1", col: solA.col + solA.w - 1, row: solA.row, w: 2, h: 3 },
      ];

      // Remove colliding blocks before inserting hint
      placed = removeCollidingBlocks(placed, solA);
      placed.push({ ...solA });

      // Conflicting part-1 must have been evicted back to tray
      expect(placed.some((p) => p.partId === "part-1")).toBe(false);
      expect(placed.some((p) => p.partId === solA.partId)).toBe(true);

      const coverage = checkBoardCoverage(puzzle.cols, puzzle.rows, placed);
      expect(coverage.hasOverlap).toBe(false);
      expect(coverage.coveredCount).toBe(solA.w * solA.h);
    });

    it("ensures overlapping parts never satisfy complete board victory", () => {
      // 6x4 board = 24 cells.
      // Force overlapping parts that nominally sum to 24 cells:
      // Part A: 4x1 (4 sq) at (0, 0)
      // Part B: 2x3 (6 sq) at (3, 0) -> overlaps (3, 0) with Part A
      // Part C: 2x3 (6 sq) at (0, 1)
      // Part D: 2x4 (8 sq) at (4, 0)
      // Total nominal area: 4 + 6 + 6 + 8 = 24, but overlap exists at (3, 0)!
      const overlappingBlocks: PlacedBlock[] = [
        { col: 0, row: 0, w: 4, h: 1 },
        { col: 3, row: 0, w: 2, h: 3 },
        { col: 0, row: 1, w: 2, h: 3 },
        { col: 4, row: 0, w: 2, h: 4 },
      ];

      const coverage = checkBoardCoverage(6, 4, overlappingBlocks);
      expect(coverage.hasOverlap).toBe(true);
      expect(coverage.isComplete).toBe(false);
      expect(coverage.coveredCount).toBeLessThan(24);
    });

    it("verifies progressive hint sequence clears cleanly without overlaps from empty board", () => {
      const puzzle = generateStagePuzzle(1);
      let placed: Array<PlacedBlock & { partId: string }> = [];

      for (const hint of puzzle.solution) {
        placed = removeCollidingBlocks(placed, hint);
        placed.push({ ...hint });

        const intermediateCoverage = checkBoardCoverage(puzzle.cols, puzzle.rows, placed);
        expect(intermediateCoverage.hasOverlap).toBe(false);
      }

      const finalCoverage = checkBoardCoverage(puzzle.cols, puzzle.rows, placed);
      expect(finalCoverage.hasOverlap).toBe(false);
      expect(finalCoverage.isComplete).toBe(true);
      expect(finalCoverage.coveredCount).toBe(puzzle.cols * puzzle.rows);
    });
  });
});
