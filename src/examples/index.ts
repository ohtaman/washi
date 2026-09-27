export interface ExampleModel {
  id: string;
  title: string;
  category: "MIP" | "LP" | "Combinatorial" | "QP";
  description: string;
  code: string;
  visualizer?: "table" | "nqueens" | "knapsack" | "production" | "nurse" | "supply-chain";
}

export const EXAMPLES: ExampleModel[] = [
  {
    id: "supply_chain_large",
    title: "Supply Chain & Logistics Network (20,050 Variables)",
    category: "MIP",
    description: "Industrial-scale Capacitated Facility Location & Distribution across 50 warehouses and 400 retail demand points (20,050 variables, 451 constraints). Solves in ~15s with HiGHS WebAssembly.",
    visualizer: "supply-chain",
    code: `// --- Large-Scale Supply Chain Optimization (20,050 Variables) ---
// 50 Potential Distribution Centers (Warehouses) x 400 Retail Demand Points
const m = new Model({ name: "SupplyChainLargeScale", sense: "Minimize" });

const numWarehouses = 50;
const numCustomers = 400;

// Deterministic seed for reproducible realistic data
let seed = 42;
function rand() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}

// 1. Data Setup
// Customer Demands (30 - 70 units each)
const demands = Array.from({ length: numCustomers }, () => Math.floor(30 + rand() * 40));

// Warehouse Capacities (800 - 1,600 units) and Fixed Opening Costs ($5,000 - $10,000)
const capacities = Array.from({ length: numWarehouses }, () => Math.floor(800 + rand() * 800));
const fixedCosts = Array.from({ length: numWarehouses }, () => Math.floor(5000 + rand() * 5000));

// Transportation Unit Costs based on simulated Euclidean distances
const transCosts = [];
for (let w = 0; w < numWarehouses; w++) {
  const row = [];
  const wx = rand() * 100, wy = rand() * 100;
  for (let c = 0; c < numCustomers; c++) {
    const cx = rand() * 100, cy = rand() * 100;
    const dist = Math.hypot(wx - cx, wy - cy);
    row.push(Math.round((2.0 + dist * 0.15) * 10) / 10);
  }
  transCosts.push(row);
}

// 2. Decision Variables
// Binary: Open warehouse w or not (50 variables)
const y = [];
for (let w = 0; w < numWarehouses; w++) {
  y.push(m.addVar({ name: \`y_\${w}\`, type: "Binary" }));
}

// Continuous: Quantity shipped from warehouse w to customer c (50 x 400 = 20,000 variables)
const x = [];
const objTerms = [];

for (let w = 0; w < numWarehouses; w++) {
  objTerms.push({ v: y[w], c: fixedCosts[w] });
}

for (let w = 0; w < numWarehouses; w++) {
  const row = [];
  for (let c = 0; c < numCustomers; c++) {
    const v = m.addVar({ name: \`x_\${w}_\${c}\`, type: "Continuous", lb: 0 });
    row.push(v);
    objTerms.push({ v, c: transCosts[w][c] });
  }
  x.push(row);
}

// Total Variables = 50 + 20,000 = 20,050
m.minimize(sum(objTerms, t => t.v.mul(t.c)));

// 3. Constraints
// 3.1. Demand Satisfaction: sum_{w} x[w][c] >= demand[c] (400 constraints)
for (let c = 0; c < numCustomers; c++) {
  const suppliers = [];
  for (let w = 0; w < numWarehouses; w++) {
    suppliers.push(x[w][c]);
  }
  m.addConstraint(sum(suppliers).ge(demands[c]), \`demand_\${c}\`);
}

// 3.2. Capacity Linking: sum_{c} x[w][c] <= capacities[w] * y[w] (50 constraints)
for (let w = 0; w < numWarehouses; w++) {
  const shipments = [];
  for (let c = 0; c < numCustomers; c++) {
    shipments.push(x[w][c]);
  }
  m.addConstraint(sum(shipments).sub(y[w].mul(capacities[w])).le(0), \`cap_\${w}\`);
}

// 3.3. Opening Limit: at most 25 warehouses (1 constraint)
m.addConstraint(sum(y).le(25), "max_warehouses");

console.log(\`Model constructed: \${m.variables.length} vars, \${m.constraints.length} constraints.\`);
console.log("Optimizing with HiGHS WASM in Web Worker...");

const status = await m.optimize();

const opened = y.filter(yw => Math.round(yw.value ?? 0) === 1);
console.log(\`Status: \${status}\`);
console.log(\`Optimal Total Cost: $\${m.objectiveValue?.toFixed(2)}\`);
console.log(\`Opened \${opened.length} / \${numWarehouses} facilities.\`);
`,
  },
  {
    id: "nurse",
    title: "Nurse Scheduling (10 Nurses, 7 Days, Complex Constraints)",
    category: "MIP",
    description: "Multi-shift nurse rostering with skill mix (leaders), coverage requirements, consecutive work limits, rest intervals (no day shift after night shift), and preference penalties.",
    visualizer: "nurse",
    code: `// --- Nurse Scheduling Problem (10 Nurses, 7 Days, 3 Shifts) ---
const m = new Model({ name: "NurseScheduling", sense: "Minimize" });

// 1. Sets and Workforce Data
const nurses = [
  { id: "Alice",   role: "Leader",    isLeader: true,  maxDays: 5 },
  { id: "Bob",     role: "Leader",    isLeader: true,  maxDays: 5 },
  { id: "Charlie", role: "Leader",    isLeader: true,  maxDays: 5 },
  { id: "Diana",   role: "Leader",    isLeader: true,  maxDays: 5 },
  { id: "Evan",    role: "Regular",   isLeader: false, maxDays: 5 },
  { id: "Fiona",   role: "Regular",   isLeader: false, maxDays: 5 },
  { id: "George",  role: "Regular",   isLeader: false, maxDays: 5 },
  { id: "Hannah",  role: "Regular",   isLeader: false, maxDays: 5 },
  { id: "Ian",     role: "Part-time", isLeader: false, maxDays: 4 },
  { id: "Julia",   role: "Part-time", isLeader: false, maxDays: 4 },
];

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shifts = ["D", "E", "N"]; // D: Day, E: Evening, N: Night

// Minimum staffing requirements per day & shift
// Mon-Fri: Day: 2, Evening: 2, Night: 1 (Total: 5/day)
// Sat-Sun: Day: 2, Evening: 1, Night: 1 (Total: 4/day)
const reqs = {
  Mon: { D: 2, E: 2, N: 1 },
  Tue: { D: 2, E: 2, N: 1 },
  Wed: { D: 2, E: 2, N: 1 },
  Thu: { D: 2, E: 2, N: 1 },
  Fri: { D: 2, E: 2, N: 1 },
  Sat: { D: 2, E: 1, N: 1 },
  Sun: { D: 2, E: 1, N: 1 },
};

// Soft constraints: Nurse holiday preferences (requests for time-off)
const offRequests = [
  { nurse: "Alice",  day: "Sun", penalty: 20 },
  { nurse: "Bob",    day: "Mon", penalty: 15 },
  { nurse: "Diana",  day: "Fri", penalty: 25 },
  { nurse: "Evan",   day: "Sat", penalty: 15 },
  { nurse: "George", day: "Wed", penalty: 20 },
];

// 2. Decision Variables: x[nurse][day][shift] in {0, 1}
const x = {};
for (const n of nurses) {
  x[n.id] = {};
  for (const d of days) {
    x[n.id][d] = {};
    for (const s of shifts) {
      x[n.id][d][s] = m.addVar({
        name: \`x_\${n.id}_\${d}_\${s}\`,
        type: "Binary",
      });
    }
  }
}

// 3. Hard Constraints

// (H1) Each nurse can work at most ONE shift per day
for (const n of nurses) {
  for (const d of days) {
    m.addConstraint(sum(shifts, s => x[n.id][d][s]).le(1), \`c_oneshift_\${n.id}_\${d}\`);
  }
}

// (H2) Daily shift coverage requirements
for (const d of days) {
  for (const s of shifts) {
    m.addConstraint(
      sum(nurses, n => x[n.id][d][s]).ge(reqs[d][s]),
      \`c_coverage_\${d}_\${s}\`
    );
  }
}

// (H3) Skill Mix: At least 1 Leader nurse on Day shift, and at least 1 on Evening/Night
const leaders = nurses.filter(n => n.isLeader);
for (const d of days) {
  m.addConstraint(sum(leaders, n => x[n.id][d]["D"]).ge(1), \`c_lead_day_\${d}\`);
  m.addConstraint(sum(leaders, n => x[n.id][d]["E"].add(x[n.id][d]["N"])).ge(1), \`c_lead_eve_night_\${d}\`);
}

// (H4) Maximum working days per week
for (const n of nurses) {
  const allShifts = [];
  for (const d of days) {
    for (const s of shifts) allShifts.push(x[n.id][d][s]);
  }
  m.addConstraint(sum(allShifts).le(n.maxDays), \`c_maxdays_\${n.id}\`);
}

// (H5) Shift transitions / Mandatory rest hours:
// - Night (N) -> CANNOT work Day (D) or Evening (E) next day
// - Evening (E) -> CANNOT work Day (D) next day
for (const n of nurses) {
  for (let t = 0; t < days.length - 1; t++) {
    const today = days[t];
    const tomorrow = days[t + 1];

    m.addConstraint(x[n.id][today]["N"].add(x[n.id][tomorrow]["D"]).le(1), \`c_ND_\${n.id}_\${today}\`);
    m.addConstraint(x[n.id][today]["N"].add(x[n.id][tomorrow]["E"]).le(1), \`c_NE_\${n.id}_\${today}\`);
    m.addConstraint(x[n.id][today]["E"].add(x[n.id][tomorrow]["D"]).le(1), \`c_ED_\${n.id}_\${today}\`);
  }
}

// (H6) Maximum consecutive working days: At most 4 consecutive working days
for (const n of nurses) {
  for (let t = 0; t <= days.length - 5; t++) {
    const windowShifts = [];
    for (let k = 0; k < 5; k++) {
      for (const s of shifts) windowShifts.push(x[n.id][days[t + k]][s]);
    }
    m.addConstraint(sum(windowShifts).le(4), \`c_consec_\${n.id}_\${t}\`);
  }
}

// (H7) Night shift limit: At most 2 consecutive night shifts
for (const n of nurses) {
  for (let t = 0; t <= days.length - 3; t++) {
    m.addConstraint(
      x[n.id][days[t]]["N"].add(x[n.id][days[t+1]]["N"]).add(x[n.id][days[t+2]]["N"]).le(2),
      \`c_night_consec_\${n.id}_\${t}\`
    );
  }
}

// 4. Objective: Minimize off-request penalties + night shift loads
const penalties = [];
for (const req of offRequests) {
  for (const s of shifts) {
    penalties.push(x[req.nurse][req.day][s].mul(req.penalty));
  }
}
for (const n of nurses) {
  for (const d of days) {
    penalties.push(x[n.id][d]["N"].mul(1));
  }
}
m.minimize(sum(penalties));

// 5. Solve using HiGHS WebAssembly
const status = await m.optimize();

console.log("Solver Status:", status);
console.log("Total Penalty Score:", m.objectiveValue);

// Display Schedule Matrix
console.log("\\n" + "=".repeat(62));
console.log("📅 OPTIMAL NURSE ROSTER (10 Nurses, 7 Days)");
console.log("=".repeat(62));
console.log("Nurse".padEnd(12) + "Role".padEnd(12) + days.join("  ") + "   Total");
console.log("-".repeat(62));

for (const n of nurses) {
  const row = [];
  let count = 0;
  for (const d of days) {
    let assigned = "-";
    for (const s of shifts) {
      if (x[n.id][d][s].value === 1) {
        assigned = s;
        count++;
        break;
      }
    }
    row.push(assigned);
  }
  console.log(n.id.padEnd(12) + n.role.padEnd(12) + row.join("   ") + "   " + count + " days");
}
console.log("=".repeat(62));
`,
  },
  {
    id: "production",
    title: "Production Planning (Chairs & Tables)",
    category: "MIP",
    description: "Classic workshop resource allocation problem. Maximize total profit from producing chairs and tables subject to carpentry and finishing labor limits.",
    visualizer: "production",
    code: `// 1. Create optimization model
const m = new Model({ name: "ProductionPlanning", sense: "Maximize" });

// 2. Define integer decision variables with lower bounds >= 0
const chairs = m.addVar({ name: "chairs", type: "Integer", lb: 0 });
const tables = m.addVar({ name: "tables", type: "Integer", lb: 0 });

// 3. Set Objective: Maximize profit ($30/chair, $50/table)
m.maximize(chairs.mul(30).add(tables.mul(50)));

// 4. Add Constraints:
// Carpentry: 1h/chair + 2h/table <= 40 hours available
m.addConstraint(chairs.add(tables.mul(2)).le(40), "carpentry");

// Finishing: 2h/chair + 1h/table <= 50 hours available
m.addConstraint(chairs.mul(2).add(tables).le(50), "finishing");

// 5. Solve with HiGHS WASM in browser
const status = await m.optimize();

console.log("Status:", status);
console.log("Optimal Profit: $" + m.objectiveValue);
console.log("Chairs to produce:", chairs.value);
console.log("Tables to produce:", tables.value);
`,
  },
  {
    id: "knapsack",
    title: "0-1 Knapsack Problem",
    category: "Combinatorial",
    description: "Select the most valuable combination of items to pack into a backpack without exceeding the weight capacity limit.",
    visualizer: "knapsack",
    code: `const m = new Model({ name: "KnapsackProblem", sense: "Maximize" });

const items = [
  { name: "Laptop", weight: 3, value: 50 },
  { name: "Camera", weight: 2, value: 40 },
  { name: "Book", weight: 1, value: 10 },
  { name: "Water_Bottle", weight: 2, value: 25 },
  { name: "Drone", weight: 4, value: 65 },
  { name: "First_Aid", weight: 1, value: 15 },
];
const maxCapacity = 7;

// Binary variables: 1 if item packed, 0 otherwise
const x = m.addVars(items.map(it => it.name), { type: "Binary" });

// Objective: Maximize total value
m.maximize(sum(items, it => x[it.name].mul(it.value)));

// Constraint: Total weight <= maxCapacity
m.addConstraint(
  sum(items, it => x[it.name].mul(it.weight)).le(maxCapacity),
  "capacity_limit"
);

const status = await m.optimize();

console.log("Status:", status);
console.log("Max Total Value:", m.objectiveValue);
items.forEach(it => {
  if (x[it.name].value === 1) {
    console.log(\`Packed \${it.name} (wt: \${it.weight}, val: \${it.value})\`);
  }
});
`,
  },
  {
    id: "nqueens",
    title: "8-Queens Puzzle (MIP)",
    category: "Combinatorial",
    description: "Place 8 queens on an 8x8 chessboard such that no two queens attack each other (same row, column, or diagonal).",
    visualizer: "nqueens",
    code: `const N = 8;
const m = new Model({ name: "NQueens" });

// Binary variable board[r][c] is 1 if a queen is placed at row r, col c
const board = m.addVars2D(
  Array.from({ length: N }, (_, i) => i),
  Array.from({ length: N }, (_, j) => j),
  { type: "Binary", name: "q" }
);

// Objective: dummy (feasibility problem)
m.setObjective(0);

// 1. Exactly one queen per row
for (let r = 0; r < N; r++) {
  m.addConstraint(sum(Array.from({ length: N }, (_, c) => board[r][c])).eq(1), \`row_\${r}\`);
}

// 2. Exactly one queen per column
for (let c = 0; c < N; c++) {
  m.addConstraint(sum(Array.from({ length: N }, (_, r) => board[r][c])).eq(1), \`col_\${c}\`);
}

// 3. At most one queen per major diagonal (r - c = k)
for (let k = -(N - 1); k <= (N - 1); k++) {
  const diagCells = [];
  for (let r = 0; r < N; r++) {
    const c = r - k;
    if (c >= 0 && c < N) diagCells.push(board[r][c]);
  }
  if (diagCells.length > 1) {
    m.addConstraint(sum(diagCells).le(1));
  }
}

// 4. At most one queen per minor diagonal (r + c = k)
for (let k = 0; k <= 2 * (N - 1); k++) {
  const antiDiagCells = [];
  for (let r = 0; r < N; r++) {
    const c = k - r;
    if (c >= 0 && c < N) antiDiagCells.push(board[r][c]);
  }
  if (antiDiagCells.length > 1) {
    m.addConstraint(sum(antiDiagCells).le(1));
  }
}

const status = await m.optimize();
console.log("Status:", status);
`,
  },
  {
    id: "diet",
    title: "Stigler's Diet Problem (LP)",
    category: "LP",
    description: "Determine the cheapest diet satisfying daily nutritional requirements (Calories, Protein, Calcium, Vitamin A/C).",
    visualizer: "table",
    code: `const m = new Model({ name: "DietProblem", sense: "Minimize" });

const foods = [
  { name: "Oatmeal", cost: 0.30, calories: 150, protein: 5, calcium: 20 },
  { name: "Chicken", cost: 2.40, calories: 230, protein: 31, calcium: 15 },
  { name: "Eggs",    cost: 0.80, calories: 140, protein: 12, calcium: 50 },
  { name: "Milk",    cost: 0.90, calories: 120, protein: 8,  calcium: 300 },
  { name: "Beans",   cost: 0.60, calories: 220, protein: 15, calcium: 80 },
  { name: "Broccoli",cost: 1.10, calories: 50,  protein: 3,  calcium: 40 },
];

const requirements = {
  calories: 2000,
  protein: 60,
  calcium: 800,
};

// Continuous serving quantities (>= 0)
const servings = m.addVars(foods.map(f => f.name), { lb: 0, type: "Continuous" });

// Minimize daily total cost
m.minimize(sum(foods, f => servings[f.name].mul(f.cost)));

// Nutrition constraints
m.addConstraint(sum(foods, f => servings[f.name].mul(f.calories)).ge(requirements.calories), "min_calories");
m.addConstraint(sum(foods, f => servings[f.name].mul(f.protein)).ge(requirements.protein), "min_protein");
m.addConstraint(sum(foods, f => servings[f.name].mul(f.calcium)).ge(requirements.calcium), "min_calcium");

const status = await m.optimize();
console.log("Daily Cost: $" + m.objectiveValue.toFixed(2));
foods.forEach(f => {
  const amount = servings[f.name].value;
  if (amount > 0.01) {
    console.log(\`  \${f.name}: \${amount.toFixed(2)} servings\`);
  }
});
`,
  },
  {
    id: "pulp_style",
    title: "PuLP Syntax Style Example",
    category: "MIP",
    description: "Write models using PuLP-compatible classes: LpProblem, LpVariable, lpSum, LpMaximize, and value().",
    visualizer: "production",
    code: `// PuLP-compatible API in JavaScript / TypeScript
const prob = new LpProblem("PuLP_Production", LpMaximize);

// Variables: LpVariable(name, lowBound, upBound, cat)
const x = new LpVariable("chairs", 0, undefined, LpInteger);
const y = new LpVariable("tables", 0, undefined, LpInteger);

// Register variables & Objective
prob.setObjective(x.mul(30).add(y.mul(50)));

// Add constraints
prob.addConstraint(x.add(y.mul(2)).le(40), "carpentry");
prob.addConstraint(x.mul(2).add(y).le(50), "finishing");

// Solve using HiGHS WASM
await prob.solve();

console.log("Status:", LpStatus[prob.status]);
console.log("Objective:", value(prob.objective));
console.log("Chairs:", value(x));
console.log("Tables:", value(y));
`,
  },
  {
    id: "mip_style",
    title: "python-mip Syntax Style Example",
    category: "MIP",
    description: "Write models using python-mip classes and idioms: MipModel, xsum, maximize, and var.x.",
    visualizer: "production",
    code: `// python-mip compatible API in JavaScript / TypeScript
const m = new MipModel("Mip_Production", MAXIMIZE);

// add_var with type and bounds
const x = m.add_var({ name: "chairs", var_type: INTEGER, lb: 0 });
const y = m.add_var({ name: "tables", var_type: INTEGER, lb: 0 });

// Set objective using maximize()
m.objective_spec = maximize(x.mul(30).add(y.mul(50)));

// Add constraints using add_constr
m.add_constr(x.add(y.mul(2)).le(40), "carpentry");
m.add_constr(x.mul(2).add(y).le(50), "finishing");

// Solve
const status = await m.optimize();

console.log("Status:", status);
console.log("Objective:", m.objective_value);
console.log("x (chairs):", x.x);
console.log("y (tables):", y.x);
`,
  },
  {
    id: "dsl_strings",
    title: "Intuitive String / Template DSL",
    category: "MIP",
    description: "Write mathematical formulas directly as strings or tagged template literals expr`...` without manual expression trees.",
    visualizer: "production",
    code: `const m = new Model({ name: "TemplateDSL", sense: "Maximize" });

const chairs = m.addVar({ name: "chairs", type: "Integer", lb: 0 });
const tables = m.addVar({ name: "tables", type: "Integer", lb: 0 });

// Tagged template literals bind variables directly!
m.maximize(expr\`30 * \${chairs} + 50 * \${tables}\`);

// Add constraints using tagged template:
m.addConstraint(expr\`\${chairs} + 2 * \${tables} <= 40\`, "carpentry");

// Or add constraints directly as plain strings with registered variable names:
m.addConstraint("2 * chairs + tables <= 50", "finishing");

const status = await m.optimize();
console.log("Status:", status);
console.log("Optimal value:", m.objectiveValue);
`,
  },
  {
    id: "solver_switching",
    title: "Solver Switching (PuLP style: HiGHS / Mock / Custom)",
    category: "MIP",
    description: "Switch solver backends seamlessly just like PuLP: solve with HiGHS WASM, MockSolver, or plug in custom optimization engines.",
    visualizer: "production",
    code: `// --- Solver Switching Architecture (PuLP Style) ---
// 1. Define mathematical model independent of any specific solver
const m = new Model({ name: "SolverIndependenceDemo", sense: "Maximize" });

const x = m.addVar({ name: "chairs", type: "Integer", lb: 0, ub: 20 });
const y = m.addVar({ name: "tables", type: "Integer", lb: 0, ub: 20 });

m.maximize(x.mul(30).add(y.mul(50)));
m.addConstraint(x.add(y.mul(2)).le(40), "carpentry");
m.addConstraint(x.mul(2).add(y).le(50), "finishing");

// 2. Inspect available registered solvers
console.log("Registered Solvers:", listAvailableSolvers()); // ["highs", "mock"]

// 3. Solve with explicit HiGHS WASM solver instance:
console.log("Solving with explicit HiGHS WASM solver...");
const statusHiGHS = await m.optimize(new HiGHS({ timeLimit: 10 }));
console.log(\`HiGHS Result: \${statusHiGHS}, Obj: \${m.objectiveValue}, chairs=\${x.value}, tables=\${y.value}\`);

// 4. PuLP-compatible problem style:
const prob = new LpProblem("PuLPDemo", LpMaximize);
const p_x = new LpVariable("chairs", 0, undefined, LpInteger);
const p_y = new LpVariable("tables", 0, undefined, LpInteger);
prob.add(p_x.mul(30).add(p_y.mul(50)));
prob.add(p_x.add(p_y.mul(2)).le(40));
prob.add(p_x.mul(2).add(p_y).le(50));

// Pass solver directly to solve() - exactly like pulp.solve(HiGHS()):
await prob.solve(new HiGHS());
console.log(\`PuLP with HiGHS: Obj=\${value(prob.objective)}, chairs=\${value(p_x)}, tables=\${value(p_y)}\`);

// 5. You can also define your own custom solver engine:
const customEngine = {
  name: "MyCustomOptimizer",
  async solve(modelData, lpResult) {
    console.log("Custom solver received LP string of length:", lpResult.lpString.length);
    // You can call any external REST API, Python backend, or custom algorithm here
    return {
      status: "Optimal",
      objectiveValue: 1100,
      values: { chairs: 20, tables: 10 },
      runTime: 0.002,
    };
  }
};

await prob.solve(customEngine);
console.log(\`Custom Engine: Obj=\${value(prob.objective)}, chairs=\${value(p_x)}, tables=\${value(p_y)}\`);
`,
  },
  {
    id: "portfolio_qp",
    title: "Markowitz Portfolio Optimization (Convex QP)",
    category: "QP",
    description: "Convex Quadratic Programming (QP) minimizing investment risk (covariance matrix) subject to capital and target return constraints. Solved natively with HiGHS QP.",
    visualizer: "table",
    code: `// --- Markowitz Mean-Variance Portfolio Optimization (QP) ---
// Minimize portfolio variance risk subject to return & budget constraints.
const m = new Model({ name: "PortfolioOptimization", sense: "Minimize" });

// 1. Assets: US Tech, US Bonds, Global Equity, Real Estate, Gold
const assets = ["Tech", "Bonds", "GlobalEq", "RealEstate", "Gold"];
const expectedReturns = [0.15, 0.04, 0.10, 0.08, 0.06];

// Asset weights (decision variables: 0% <= w_i <= 100%)
const w = assets.map((name) => m.addVar({ name: \`weight_\${name}\`, lb: 0, ub: 1 }));

// 2. Budget constraint: sum of weights = 1.0 (100% capital allocation)
m.addConstraint(sum(w).eq(1.0), "budget_full_investment");

// 3. Target portfolio return constraint: sum(r_i * w_i) >= 9.0%
const portfolioReturn = sum(w.map((v, i) => v.mul(expectedReturns[i])));
m.addConstraint(portfolioReturn.ge(0.09), "min_expected_return");

// 4. Covariance Matrix (risk & correlation between assets)
const cov = [
  [0.040, 0.002, 0.025, 0.015, 0.005], // Tech
  [0.002, 0.005, 0.003, 0.002, 0.001], // Bonds
  [0.025, 0.003, 0.030, 0.018, 0.008], // GlobalEq
  [0.015, 0.002, 0.018, 0.025, 0.004], // RealEstate
  [0.005, 0.001, 0.008, 0.004, 0.020], // Gold
];

// Objective: Minimize portfolio variance w^T * Cov * w
let risk = new QuadExpr();
for (let i = 0; i < assets.length; i++) {
  for (let j = 0; j < assets.length; j++) {
    if (cov[i][j] !== 0) {
      risk = risk.add(w[i].mul(w[j]).mul(cov[i][j]));
    }
  }
}

m.minimize(risk);

console.log("Optimizing convex quadratic program with HiGHS WASM...");
const status = await m.solve();

console.log(\`Solve Status: \${status}\`);
console.log(\`Optimal Portfolio Variance (Risk): \${m.objectiveValue?.toFixed(6)}\`);
console.log(\`Portfolio Std Dev (Volatility): \${Math.sqrt(m.objectiveValue || 0).toFixed(4)}\`);

assets.forEach((name, i) => {
  console.log(\`  \${name.padEnd(12)}: \${((w[i].value || 0) * 100).toFixed(2)}%\`);
});
`,
  },
];
