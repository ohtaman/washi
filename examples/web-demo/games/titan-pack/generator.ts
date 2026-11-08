// TITAN PACK: Multi-Scale Interlocking 2D Packing Generator

export interface StageSpec {
  world: number;
  cols: number;
  rows: number;
  targetPieces: number;
  diff: string;
  badgeClass: string;
}

export interface PlacedBlock {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface InventoryPart {
  id: string;
  name: string;
  w: number;
  h: number;
  origW: number;
  origH: number;
  color: string;
}

export interface PuzzleResult {
  stageNum: number;
  spec: StageSpec;
  cols: number;
  rows: number;
  parts: InventoryPart[];
  solution: Array<{
    partId: string;
    col: number;
    row: number;
    w: number;
    h: number;
  }>;
}

export const COLOR_PALETTE = [
  "#0284c7", "#059669", "#d97706", "#7c3aed", "#db2777",
  "#0d9488", "#2563eb", "#ea580c", "#e11d48", "#16a34a",
  "#4f46e5", "#ca8a04", "#0891b2", "#be123c",
];

// PRNG: Mulberry32 (Deterministic by seed)
export function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Computes optimal cell size (px) for the titanium sheet plate grid.
 * Dynamically adapts to narrow mobile viewports (e.g. 375px or 320px screen width)
 * and stage grid dimensions (cols x rows) so the plate never clips or overflows.
 * Clamps result between minCell (18px) and maxCell (54px).
 */
export function computeTitanCellSize(
  cols: number,
  rows: number,
  availableWidth: number = 600,
  availableHeight: number = 480,
  paddingAndBorder: number = 20,
): number {
  const usableW = Math.max(80, availableWidth - paddingAndBorder);
  const usableH = Math.max(80, availableHeight - paddingAndBorder);
  const cellW = Math.floor(usableW / Math.max(1, cols));
  const cellH = Math.floor(usableH / Math.max(1, rows));
  const size = Math.min(cellW, cellH);
  return Math.max(18, Math.min(54, size));
}

export interface BoardCoverageResult {
  hasOverlap: boolean;
  coveredCount: number;
  totalArea: number;
  isComplete: boolean;
}

/**
 * Validates board coverage by calculating distinct cell occupancy.
 * Detects boundary violations, pairwise cell overlaps, and empty voids.
 */
export function checkBoardCoverage(
  cols: number,
  rows: number,
  blocks: PlacedBlock[]
): BoardCoverageResult {
  const grid = Array.from({ length: rows }, () => new Uint8Array(cols));
  let hasOverlap = false;

  for (const p of blocks) {
    for (let r = p.row; r < p.row + p.h; r++) {
      for (let c = p.col; c < p.col + p.w; c++) {
        if (c < 0 || c >= cols || r < 0 || r >= rows) {
          hasOverlap = true;
        } else if (grid[r][c] > 0) {
          hasOverlap = true;
        } else {
          grid[r][c] = 1;
        }
      }
    }
  }

  let coveredCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 1) coveredCount++;
    }
  }

  const totalArea = cols * rows;
  return {
    hasOverlap,
    coveredCount,
    totalArea,
    isComplete: !hasOverlap && coveredCount === totalArea,
  };
}

/**
 * Removes any placed blocks that overlap or collide with the target block area.
 */
export function removeCollidingBlocks<T extends PlacedBlock>(
  placed: T[],
  target: PlacedBlock
): T[] {
  return placed.filter((p) => {
    const intersects = !(
      p.col + p.w <= target.col ||
      target.col + target.w <= p.col ||
      p.row + p.h <= target.row ||
      target.row + target.h <= p.row
    );
    return !intersects;
  });
}


// Fault-Line Check: true if any line cuts continuously from edge to edge
export function hasFaultLines(cols: number, rows: number, blocks: PlacedBlock[]): boolean {
  for (let c = 1; c < cols; c++) {
    if (!blocks.some((b) => b.col < c && b.col + b.w > c)) return true;
  }
  for (let r = 1; r < rows; r++) {
    if (!blocks.some((b) => b.row < r && b.row + b.h > r)) return true;
  }
  return false;
}

// Stage Progression Specs (World 1..4 + Endless)
export function getStageSpec(stageNum: number): StageSpec {
  if (stageNum === 1) {
    return { world: 1, cols: 6, rows: 4, targetPieces: 5, diff: "Apprentice 01", badgeClass: "diff-w1" };
  } else if (stageNum === 2) {
    return { world: 1, cols: 7, rows: 5, targetPieces: 6, diff: "Apprentice 02", badgeClass: "diff-w1" };
  } else if (stageNum === 3) {
    return { world: 2, cols: 8, rows: 5, targetPieces: 6, diff: "Artisan 01", badgeClass: "diff-w2" };
  } else if (stageNum === 4) {
    return { world: 2, cols: 8, rows: 6, targetPieces: 7, diff: "Artisan 02", badgeClass: "diff-w2" };
  } else if (stageNum === 5) {
    return { world: 2, cols: 9, rows: 6, targetPieces: 7, diff: "Artisan 03", badgeClass: "diff-w2" };
  } else if (stageNum === 6) {
    return { world: 3, cols: 9, rows: 7, targetPieces: 8, diff: "Meister 01", badgeClass: "diff-w3" };
  } else if (stageNum === 7) {
    return { world: 3, cols: 10, rows: 7, targetPieces: 8, diff: "Meister 02", badgeClass: "diff-w3" };
  } else if (stageNum === 8) {
    return { world: 3, cols: 10, rows: 8, targetPieces: 9, diff: "Meister 03", badgeClass: "diff-w3" };
  } else if (stageNum === 9) {
    return { world: 4, cols: 11, rows: 8, targetPieces: 9, diff: "Legendary 01", badgeClass: "diff-w4" };
  } else if (stageNum === 10) {
    return { world: 4, cols: 12, rows: 8, targetPieces: 10, diff: "Legendary 02", badgeClass: "diff-w4" };
  } else {
    const extra = stageNum - 10;
    const cols = Math.min(14, 12 + Math.floor(extra / 4));
    const rows = Math.min(9, 8 + Math.floor(extra / 4));
    const targetPieces = Math.min(12, 10 + Math.floor(extra / 3));
    return { world: 5, cols, rows, targetPieces, diff: `Extreme ${extra}`, badgeClass: "diff-endless" };
  }
}

function shapeKey(w: number, h: number): string {
  return w <= h ? `${w}x${h}` : `${h}x${w}`;
}

function scoreLayoutDiversity(cols: number, rows: number, blocks: PlacedBlock[]): number {
  const uniqueShapes = new Set(blocks.map((b) => shapeKey(b.w, b.h))).size;
  let score = uniqueShapes * 18;
  const totalArea = cols * rows;

  for (const b of blocks) {
    const minDim = Math.min(b.w, b.h);
    const maxDim = Math.max(b.w, b.h);
    const areaRatio = (b.w * b.h) / totalArea;

    // Penalize 1x1 filler blocks and long thin 1xN strips
    if (b.w === 1 && b.h === 1) {
      score -= 60;
    } else if (minDim === 1 && maxDim >= 4) {
      score -= (maxDim - 2) * 14;
    } else if (minDim === 1) {
      score -= 8;
    }

    // Penalize blocks that span almost an entire board dimension
    if (b.w >= cols - 1) score -= 18;
    if (b.h >= rows - 1) score -= 18;
    if (b.w / cols > 0.65) score -= 8;
    if (b.h / rows > 0.65) score -= 8;

    // Penalize overly dominant single blocks
    if (areaRatio > 0.32) score -= 20;
  }

  return score;
}

// Generate Deterministic Puzzle for Stage
export function generateStagePuzzle(stageNum: number): PuzzleResult {
  const spec = getStageSpec(stageNum);
  const { cols, rows, targetPieces } = spec;
  const rng = mulberry32(stageNum * 9973 + 615193);

  // Stage 1 curated tutorial
  if (stageNum === 1) {
    const blocks: PlacedBlock[] = [
      { col: 0, row: 0, w: 4, h: 1 },
      { col: 4, row: 0, w: 2, h: 3 },
      { col: 1, row: 3, w: 5, h: 1 },
      { col: 0, row: 1, w: 1, h: 3 },
      { col: 1, row: 1, w: 3, h: 2 },
    ];
    return buildPuzzleResult(stageNum, spec, cols, rows, blocks, rng);
  }

  let bestBlocks: PlacedBlock[] | null = null;
  let bestScore = -Infinity;

  // Multi-Scale Interlocking & Core Partition
  for (let attempt = 0; attempt < 40; attempt++) {
    const minW = cols >= 7 ? 2 : 1;
    const maxW = Math.max(minW, Math.min(cols - minW - 2, Math.floor(cols * 0.42)));
    const minH = rows >= 6 ? 2 : 1;
    const maxH = Math.max(minH, Math.min(rows - minH - 2, Math.floor(rows * 0.42)));

    const wL = minW + Math.floor(rng() * (maxW - minW + 1));
    const wR = minW + Math.floor(rng() * (maxW - minW + 1));
    let hT = minH + Math.floor(rng() * (maxH - minH + 1));
    let hB = minH + Math.floor(rng() * (maxH - minH + 1));

    // On 5-row boards, avoid having both top and bottom arms be 1-cell thin
    if (rows === 5 && hT === 1 && hB === 1) {
      if (rng() > 0.5) hT = 2;
      else hB = 2;
    }

    const centerW = cols - wL - wR;
    const centerH = rows - hT - hB;
    if (centerW < 2 || centerH < 2) continue;

    // Alternate chirality (clockwise vs counter-clockwise pinwheel)
    const clockwise = (attempt + stageNum) % 2 === 0;
    let blocks: PlacedBlock[] = clockwise
      ? [
          { col: 0, row: 0, w: cols - wR, h: hT },
          { col: cols - wR, row: 0, w: wR, h: rows - hB },
          { col: wL, row: rows - hB, w: cols - wL, h: hB },
          { col: 0, row: hT, w: wL, h: rows - hT },
          { col: wL, row: hT, w: centerW, h: centerH },
        ]
      : [
          { col: wL, row: 0, w: cols - wL, h: hT },
          { col: cols - wR, row: hT, w: wR, h: rows - hT },
          { col: 0, row: rows - hB, w: cols - wR, h: hB },
          { col: 0, row: 0, w: wL, h: rows - hB },
          { col: wL, row: hT, w: centerW, h: centerH },
        ];

    // Optional nested inner pinwheel when center is large enough and targetPieces >= 9
    if (targetPieces >= 9 && centerW >= 4 && centerH >= 4 && rng() > 0.35) {
      const iwL = 1 + Math.floor(rng() * Math.max(1, centerW - 3));
      const iwR = 1;
      const ihT = 1 + Math.floor(rng() * Math.max(1, centerH - 3));
      const ihB = 1;
      const icW = centerW - iwL - iwR;
      const icH = centerH - ihT - ihB;
      if (icW >= 1 && icH >= 1) {
        const innerBlocks: PlacedBlock[] = !clockwise
          ? [
              { col: wL, row: hT, w: centerW - iwR, h: ihT },
              { col: wL + centerW - iwR, row: hT, w: iwR, h: centerH - ihB },
              { col: wL + iwL, row: hT + centerH - ihB, w: centerW - iwL, h: ihB },
              { col: wL, row: hT + ihT, w: iwL, h: centerH - ihT },
              { col: wL + iwL, row: hT + ihT, w: icW, h: icH },
            ]
          : [
              { col: wL + iwL, row: hT, w: centerW - iwL, h: ihT },
              { col: wL + centerW - iwR, row: hT + ihT, w: iwR, h: centerH - ihT },
              { col: wL, row: hT + centerH - ihB, w: centerW - iwR, h: ihB },
              { col: wL, row: hT, w: iwL, h: centerH - ihB },
              { col: wL + iwL, row: hT + ihT, w: icW, h: icH },
            ];
        const nestedTest = [...blocks.slice(0, 4), ...innerBlocks];
        if (nestedTest.length <= targetPieces && !hasFaultLines(cols, rows, nestedTest)) {
          blocks = nestedTest;
        }
      }
    }

    if (hasFaultLines(cols, rows, blocks)) continue;

    let stuck = false;
    let subAttempts = 0;
    while (blocks.length < targetPieces && subAttempts++ < 60) {
      interface CandidateSplit {
        idx: number;
        b1: PlacedBlock;
        b2: PlacedBlock;
        weight: number;
      }
      const candidates: CandidateSplit[] = [];
      const existingShapes = new Set(blocks.map((blk) => shapeKey(blk.w, blk.h)));

      for (let idx = 0; idx < blocks.length; idx++) {
        const b = blocks[idx];
        // Try all vertical split positions
        for (let s = 1; s < b.w; s++) {
          const b1: PlacedBlock = { col: b.col, row: b.row, w: s, h: b.h };
          const b2: PlacedBlock = { col: b.col + s, row: b.row, w: b.w - s, h: b.h };
          const test = [...blocks.slice(0, idx), b1, b2, ...blocks.slice(idx + 1)];
          if (!hasFaultLines(cols, rows, test)) {
            const minThickness = Math.min(b1.w, b1.h, b2.w, b2.h);
            const spanScore = (b.w / cols) * 25 + (b.w * b.h) / (cols * rows) * 15;
            const novelty =
              (existingShapes.has(shapeKey(b1.w, b1.h)) ? 0 : 8) +
              (existingShapes.has(shapeKey(b2.w, b2.h)) ? 0 : 8) +
              (shapeKey(b1.w, b1.h) !== shapeKey(b2.w, b2.h) ? 6 : 0);
            const isUnit = (b1.w === 1 && b1.h === 1) || (b2.w === 1 && b2.h === 1);
            const thinPenalty = isUnit ? -60 : minThickness === 1 ? -22 : 0;
            candidates.push({ idx, b1, b2, weight: spanScore + novelty + thinPenalty + rng() * 6 });
          }
        }
        // Try all horizontal split positions
        for (let s = 1; s < b.h; s++) {
          const b1: PlacedBlock = { col: b.col, row: b.row, w: b.w, h: s };
          const b2: PlacedBlock = { col: b.col, row: b.row + s, w: b.w, h: b.h - s };
          const test = [...blocks.slice(0, idx), b1, b2, ...blocks.slice(idx + 1)];
          if (!hasFaultLines(cols, rows, test)) {
            const minThickness = Math.min(b1.w, b1.h, b2.w, b2.h);
            const spanScore = (b.h / rows) * 25 + (b.w * b.h) / (cols * rows) * 15;
            const novelty =
              (existingShapes.has(shapeKey(b1.w, b1.h)) ? 0 : 8) +
              (existingShapes.has(shapeKey(b2.w, b2.h)) ? 0 : 8) +
              (shapeKey(b1.w, b1.h) !== shapeKey(b2.w, b2.h) ? 6 : 0);
            const isUnit = (b1.w === 1 && b1.h === 1) || (b2.w === 1 && b2.h === 1);
            const thinPenalty = isUnit ? -60 : minThickness === 1 ? -22 : 0;
            candidates.push({ idx, b1, b2, weight: spanScore + novelty + thinPenalty + rng() * 6 });
          }
        }
      }

      if (candidates.length === 0) {
        stuck = true;
        break;
      }

      candidates.sort((x, y) => y.weight - x.weight);
      const chosen = candidates[Math.floor(rng() * Math.min(3, candidates.length))];
      blocks = [
        ...blocks.slice(0, chosen.idx),
        chosen.b1,
        chosen.b2,
        ...blocks.slice(chosen.idx + 1),
      ];
    }

    if (!stuck && blocks.length === targetPieces && !hasFaultLines(cols, rows, blocks)) {
      const score = scoreLayoutDiversity(cols, rows, blocks);
      if (score > bestScore) {
        bestScore = score;
        bestBlocks = blocks;
      }
      if (attempt >= 12 && bestScore >= targetPieces * 14) {
        break;
      }
    }
  }

  if (bestBlocks) {
    return buildPuzzleResult(stageNum, spec, cols, rows, bestBlocks, rng);
  }

  // Guaranteed fallback layout with exact targetPieces
  let fallbackBlocks: PlacedBlock[] = [
    { col: 0, row: 0, w: cols - 2, h: 2 },
    { col: cols - 2, row: 0, w: 2, h: rows - 2 },
    { col: 2, row: rows - 2, w: cols - 2, h: 2 },
    { col: 0, row: 2, w: 2, h: rows - 2 },
    { col: 2, row: 2, w: cols - 4, h: rows - 4 },
  ];
  while (fallbackBlocks.length < targetPieces) {
    fallbackBlocks.sort((a, b) => b.w * b.h - a.w * a.h);
    let splitApplied = false;
    for (let i = 0; i < fallbackBlocks.length; i++) {
      const b = fallbackBlocks[i];
      if (b.w >= 2) {
        for (let s = Math.floor(b.w / 2); s >= 1; s--) {
          const b1: PlacedBlock = { col: b.col, row: b.row, w: s, h: b.h };
          const b2: PlacedBlock = { col: b.col + s, row: b.row, w: b.w - s, h: b.h };
          const test = [...fallbackBlocks.slice(0, i), b1, b2, ...fallbackBlocks.slice(i + 1)];
          if (!hasFaultLines(cols, rows, test)) {
            fallbackBlocks = test;
            splitApplied = true;
            break;
          }
        }
        if (splitApplied) break;
      }
      if (b.h >= 2) {
        for (let s = Math.floor(b.h / 2); s >= 1; s--) {
          const b1: PlacedBlock = { col: b.col, row: b.row, w: b.w, h: s };
          const b2: PlacedBlock = { col: b.col, row: b.row + s, w: b.w, h: b.h - s };
          const test = [...fallbackBlocks.slice(0, i), b1, b2, ...fallbackBlocks.slice(i + 1)];
          if (!hasFaultLines(cols, rows, test)) {
            fallbackBlocks = test;
            splitApplied = true;
            break;
          }
        }
        if (splitApplied) break;
      }
    }
    if (!splitApplied) break;
  }
  return buildPuzzleResult(stageNum, spec, cols, rows, fallbackBlocks, rng);
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function buildPuzzleResult(
  stageNum: number,
  spec: StageSpec,
  cols: number,
  rows: number,
  blocks: PlacedBlock[],
  rng: () => number
): PuzzleResult {
  const orderedBlocks = blocks.slice();
  if (stageNum > 1) {
    shuffleInPlace(orderedBlocks, rng);
  }

  const parts: InventoryPart[] = orderedBlocks.map((b, i) => {
    const id = String.fromCharCode(65 + i);
    const rotateInitial = rng() > 0.5;
    return {
      id,
      name: id,
      w: rotateInitial ? b.h : b.w,
      h: rotateInitial ? b.w : b.h,
      origW: b.w,
      origH: b.h,
      color: COLOR_PALETTE[i % COLOR_PALETTE.length],
    };
  });

  // Seeded Fisher-Yates shuffle of inventory display order
  shuffleInPlace(parts, rng);

  const solution = orderedBlocks.map((b, i) => ({
    partId: String.fromCharCode(65 + i),
    col: b.col,
    row: b.row,
    w: b.w,
    h: b.h,
  }));

  return { stageNum, spec, cols, rows, parts, solution };
}
