# Mobile Math Puzzle Framework (`puzzle-framework`)

A reusable, mobile-first boilerplate framework for rapidly producing mathematical optimization and constraint-based puzzle games powered by `@ohtaman/washi`.

---

## 1. Motivation & Features

When producing a suite of math puzzle games (MILP, SMT, Quadratic, or Graph flow puzzles), implementing the user interface from scratch creates redundant boilerplate (100vh responsive mobile shells, Undo/Redo history, auto-saving interrupted states, inline win/loss banners, and solver workers).

This framework abstracts the entire mobile puzzle lifecycle so game developers only need to specify:
1. **Mathematical Model & Rule Evaluation** (Washi formulation, score, target).
2. **Deterministic Endless Stage Generator** (seed-based procedural puzzles verified by solver).
3. **Board Rendering Function** (interactive tiles, cards, or grid).

### Key Built-in Capabilities:
- **Instant Play ("Zero-Second Start")**: Launches directly into the current stage with no blocking title splash screens.
- **Interruption Recovery**: In-progress board state auto-saves to `localStorage` on every move, resuming seamlessly if the player switches tabs or receives a phone call.
- **Inline Result Banners**: Non-blocking green clear banners and yellow shortfall banners ("Need +3 more pt") maintain player tempo without full-screen dialog interruptions.
- **One-Thumb Mobile Toolbar**: Bottom-docked 44px touch targets for `Undo (Z)`, `Restart (R)`, `Hint (H)`, and `Optimal Solution`.
- **Endless Mode Pipeline**: Transitions seamlessly from tutorial campaign stages into procedurally generated, solver-verified infinite stages (`EX 13`, `EX 14`, ...).
- **Zero-Dependency Sound Synthesizer**: Web Audio API generates responsive acoustic pops, fanfares, and chimes without external audio asset downloads.

---

## 2. Quick Start Example

### Step 1: Create Game Definition (`main.ts`)

```typescript
import { createPuzzleApp, type PuzzleDefinition } from "../puzzle-framework/index.js";
import { solveWithWashi, generateVerifiedStage } from "./solver.js";
import type { BackpackState, BackpackMove, BackpackStage } from "./types.js";

const definition: PuzzleDefinition<BackpackState, BackpackMove, BackpackStage> = {
  id: "backpack-packer",
  title: { en: "Backpack Packer", ja: "Backpack Packer" },
  subtitle: { en: "Knapsack Optimization", ja: "Knapsack Optimization" },
  rulesSummary: {
    en: "Pack items without exceeding maximum weight to reach the target value.",
  },

  // 1. Campaign Tutorial Stages
  campaignStages: [
    { stageNumber: 1, capacity: 10, targetValue: 15, items: [...] },
    { stageNumber: 2, capacity: 15, targetValue: 24, items: [...] },
  ],

  getStageNumber: (s) => s.stageNumber,
  getStageTitle: (s) => `Capacity ${s.capacity}kg`,
  getStageOneLiner: (s) => `Target Value: ${s.targetValue} pts`,

  // 2. Endless Procedural Generator
  generateStage: async (stageNumber, seed) => {
    return await generateVerifiedStage(stageNumber, seed);
  },

  // 3. State & Rule Application
  createInitialState: () => ({ packedItemIds: [] }),
  applyMove: (state, move) => ({
    packedItemIds: state.packedItemIds.includes(move.itemId)
      ? state.packedItemIds.filter((id) => id !== move.itemId)
      : [...state.packedItemIds, move.itemId],
  }),

  // 4. Realtime Evaluation
  evaluate: (state, stage) => {
    const totalWeight = computeWeight(state, stage);
    const totalValue = computeValue(state, stage);
    const isSafe = totalWeight <= stage.capacity;
    const isCleared = isSafe && totalValue >= stage.targetValue;

    return {
      isCleared,
      score: totalValue,
      targetScore: stage.targetValue,
      isSafe,
      shortfallReason: !isSafe
        ? `Overweight by +${totalWeight - stage.capacity}kg!`
        : totalValue < stage.targetValue
          ? `Need +${stage.targetValue - totalValue} more pts`
          : undefined,
    };
  },

  // 5. Solver Integration (HiGHS / Z3 via Washi)
  solveOptimal: async (stage, state) => {
    return await solveWithWashi(stage, state);
  },

  // 6. Board DOM Rendering
  renderBoard: (container, state, stage, onMove, context) => {
    container.innerHTML = "";
    stage.items.forEach((item) => {
      const btn = document.createElement("button");
      btn.textContent = `${item.name} (${item.weight}kg, ${item.value}pt)`;
      btn.onclick = () => onMove({ itemId: item.id });
      container.appendChild(btn);
    });
  },

  // 7. Interruption State Auto-Save
  serializeState: (state) => state.packedItemIds,
  deserializeState: (raw) => (Array.isArray(raw) ? { packedItemIds: raw } : null),
};

const app = createPuzzleApp(definition);
app.mount("#app");
```

### Step 2: HTML Shell (`index.html`)

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Backpack Packer</title>
    <!-- Common Mobile Framework Styles -->
    <link rel="stylesheet" href="../puzzle-framework/style.css" />
    <!-- Game-Specific Visual Theme -->
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

---

## 3. Directory Structure

```text
puzzle-framework/
├── README.md           # This specification guide
├── index.ts            # Public library exports
├── types.ts            # Core interfaces (PuzzleDefinition, StageEvaluation)
├── engine.ts           # Game loop, undo history, endless stage resolver
├── components.ts       # Mobile-optimized 100vh DOM shell & inline banners
├── storage.ts          # LocalStorage manager with auto-save & recovery
├── audio.ts            # Synthesized Web Audio sound effects
├── i18n.ts             # Translation catalog loader
├── locales/            # JSON translation files (en.json, ja.json, zh.json)
└── style.css           # Touch-target (44px) responsive layout styles
```
