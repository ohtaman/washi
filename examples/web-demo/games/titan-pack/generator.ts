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
    return { world: 1, cols: 6, rows: 4, targetPieces: 5, diff: "見習い 01", badgeClass: "diff-w1" };
  } else if (stageNum === 2) {
    return { world: 1, cols: 7, rows: 5, targetPieces: 5, diff: "見習い 02", badgeClass: "diff-w1" };
  } else if (stageNum === 3) {
    return { world: 2, cols: 8, rows: 5, targetPieces: 5, diff: "板金士 01", badgeClass: "diff-w2" };
  } else if (stageNum === 4) {
    return { world: 2, cols: 8, rows: 6, targetPieces: 6, diff: "板金士 02", badgeClass: "diff-w2" };
  } else if (stageNum === 5) {
    return { world: 2, cols: 9, rows: 6, targetPieces: 6, diff: "板金士 03", badgeClass: "diff-w2" };
  } else if (stageNum === 6) {
    return { world: 3, cols: 9, rows: 7, targetPieces: 6, diff: "マイスター 01", badgeClass: "diff-w3" };
  } else if (stageNum === 7) {
    return { world: 3, cols: 10, rows: 7, targetPieces: 7, diff: "マイスター 02", badgeClass: "diff-w3" };
  } else if (stageNum === 8) {
    return { world: 3, cols: 10, rows: 8, targetPieces: 7, diff: "マイスター 03", badgeClass: "diff-w3" };
  } else if (stageNum === 9) {
    return { world: 4, cols: 11, rows: 8, targetPieces: 7, diff: "伝説匠 01", badgeClass: "diff-w4" };
  } else if (stageNum === 10) {
    return { world: 4, cols: 12, rows: 8, targetPieces: 8, diff: "伝説匠 02", badgeClass: "diff-w4" };
  } else {
    const extra = stageNum - 10;
    const cols = Math.min(14, 12 + Math.floor(extra / 4));
    const rows = Math.min(9, 8 + Math.floor(extra / 4));
    const targetPieces = Math.min(10, 8 + Math.floor(extra / 3));
    return { world: 5, cols, rows, targetPieces, diff: `極限挑戦 ${extra}`, badgeClass: "diff-endless" };
  }
}

// Generate Deterministic Puzzle for Stage
export function generateStagePuzzle(stageNum: number): PuzzleResult {
  const spec = getStageSpec(stageNum);
  const { cols, rows, targetPieces } = spec;
  const rng = mulberry32(stageNum * 834927 + 104729);

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

  // Multi-Scale Interlocking & Core Partition
  for (let attempt = 0; attempt < 100; attempt++) {
    const minW = Math.max(1, Math.floor(cols * 0.18));
    const maxW = Math.max(minW + 1, Math.floor(cols * 0.38));
    const minH = Math.max(1, Math.floor(rows * 0.18));
    const maxH = Math.max(minH + 1, Math.floor(rows * 0.38));

    const wL = minW + Math.floor(rng() * (maxW - minW + 1));
    const wR = minW + Math.floor(rng() * (maxW - minW + 1));
    const hT = minH + Math.floor(rng() * (maxH - minH + 1));
    const hB = minH + Math.floor(rng() * (maxH - minH + 1));

    const centerW = cols - wL - wR;
    const centerH = rows - hT - hB;
    if (centerW < 2 || centerH < 2) continue;

    let blocks: PlacedBlock[] = [
      { col: 0, row: 0, w: cols - wR, h: hT },
      { col: cols - wR, row: 0, w: wR, h: rows - hB },
      { col: wL, row: rows - hB, w: cols - wL, h: hB },
      { col: 0, row: hT, w: wL, h: rows - hT },
      { col: wL, row: hT, w: centerW, h: centerH },
    ];

    if (hasFaultLines(cols, rows, blocks)) continue;

    let stuck = false;
    let subAttempts = 0;
    while (blocks.length < targetPieces && subAttempts++ < 60) {
      interface CandidateSplit {
        idx: number;
        b1: PlacedBlock;
        b2: PlacedBlock;
        area: number;
      }
      const candidates: CandidateSplit[] = [];

      for (let idx = 0; idx < blocks.length; idx++) {
        const b = blocks[idx];
        if (b.w >= 2) {
          const splitPoints = b.w >= 4 ? [Math.floor(b.w / 2), 2] : [1];
          for (const s of splitPoints) {
            if (s > 0 && b.w - s > 0) {
              const b1: PlacedBlock = { col: b.col, row: b.row, w: s, h: b.h };
              const b2: PlacedBlock = { col: b.col + s, row: b.row, w: b.w - s, h: b.h };
              const test = [...blocks.slice(0, idx), b1, b2, ...blocks.slice(idx + 1)];
              if (!hasFaultLines(cols, rows, test)) {
                candidates.push({ idx, b1, b2, area: b.w * b.h });
              }
            }
          }
        }
        if (b.h >= 2) {
          const splitPoints = b.h >= 4 ? [Math.floor(b.h / 2), 2] : [1];
          for (const s of splitPoints) {
            if (s > 0 && b.h - s > 0) {
              const b1: PlacedBlock = { col: b.col, row: b.row, w: b.w, h: s };
              const b2: PlacedBlock = { col: b.col, row: b.row + s, w: b.w, h: b.h - s };
              const test = [...blocks.slice(0, idx), b1, b2, ...blocks.slice(idx + 1)];
              if (!hasFaultLines(cols, rows, test)) {
                candidates.push({ idx, b1, b2, area: b.w * b.h });
              }
            }
          }
        }
      }

      if (candidates.length === 0) {
        stuck = true;
        break;
      }

      candidates.sort((x, y) => y.area - x.area);
      const chosen = candidates[Math.floor(rng() * Math.min(3, candidates.length))];
      blocks = [
        ...blocks.slice(0, chosen.idx),
        chosen.b1,
        chosen.b2,
        ...blocks.slice(chosen.idx + 1),
      ];
    }

    if (!stuck && blocks.length === targetPieces && !hasFaultLines(cols, rows, blocks)) {
      return buildPuzzleResult(stageNum, spec, cols, rows, blocks, rng);
    }
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
        const s = Math.floor(b.w / 2);
        const b1: PlacedBlock = { col: b.col, row: b.row, w: s, h: b.h };
        const b2: PlacedBlock = { col: b.col + s, row: b.row, w: b.w - s, h: b.h };
        const test = [...fallbackBlocks.slice(0, i), b1, b2, ...fallbackBlocks.slice(i + 1)];
        if (!hasFaultLines(cols, rows, test)) {
          fallbackBlocks = test;
          splitApplied = true;
          break;
        }
      }
      if (b.h >= 2) {
        const s = Math.floor(b.h / 2);
        const b1: PlacedBlock = { col: b.col, row: b.row, w: b.w, h: s };
        const b2: PlacedBlock = { col: b.col, row: b.row + s, w: b.w, h: b.h - s };
        const test = [...fallbackBlocks.slice(0, i), b1, b2, ...fallbackBlocks.slice(i + 1)];
        if (!hasFaultLines(cols, rows, test)) {
          fallbackBlocks = test;
          splitApplied = true;
          break;
        }
      }
    }
    if (!splitApplied) break;
  }
  return buildPuzzleResult(stageNum, spec, cols, rows, fallbackBlocks, rng);
  return buildPuzzleResult(stageNum, spec, cols, rows, fallbackBlocks, rng);
}

function buildPuzzleResult(
  stageNum: number,
  spec: StageSpec,
  cols: number,
  rows: number,
  blocks: PlacedBlock[],
  rng: () => number
): PuzzleResult {
  const parts: InventoryPart[] = blocks.map((b, i) => {
    const id = String.fromCharCode(65 + i);
    const rotateInitial = rng() > 0.5;
    return {
      id,
      name: `TITAN-${id}`,
      w: rotateInitial ? b.h : b.w,
      h: rotateInitial ? b.w : b.h,
      origW: b.w,
      origH: b.h,
      color: COLOR_PALETTE[i % COLOR_PALETTE.length],
    };
  });

  // Seeded shuffle of inventory display order
  parts.sort(() => rng() - 0.5);

  const solution = blocks.map((b, i) => ({
    partId: String.fromCharCode(65 + i),
    col: b.col,
    row: b.row,
    w: b.w,
    h: b.h,
  }));

  return { stageNum, spec, cols, rows, parts, solution };
}
