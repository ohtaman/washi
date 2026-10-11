export type PresetGroup = "fundamentals" | "practical" | "logic";

export interface ExampleModel {
  id: string;
  title: string;
  titleJa?: string;
  category: "LP" | "MIP" | "QP" | "SMT";
  group: PresetGroup;
  description: string;
  descriptionJa?: string;
  apis: string[];
  code: string;
  visualizer?: "summary" | "matrix" | "roster" | "coupon" | "none";
}

export const EXAMPLES: ExampleModel[] = [
  // ===========================================================================
  // 1. Fundamentals (Core Modeling APIs)
  // ===========================================================================
  {
    id: "production",
    title: "Production Planning (Chairs & Tables)",
    titleJa: "生産計画問題（椅子と机の最適生産）",
    category: "MIP",
    group: "fundamentals",
    description:
      "Classic workshop resource allocation. Maximize profit from chairs and tables subject to carpentry and finishing labor limits.",
    descriptionJa:
      "木工・仕上げ時間の制約下で椅子と机の生産数を決定し、総利益を最大化する基本モデル。",
    apis: ["addVar()", "maximize()", "addConstraint()"],
    visualizer: "summary",
    code: `// --- Production Planning (Chairs & Tables) ---
// Maximize profit under carpentry and finishing hours constraints.
const m = new Model({ name: "ProductionPlanning", sense: "Maximize" });

// Decision variables (integer quantities >= 0)
const chairs = m.addVar({ name: "chairs", type: "Integer", lb: 0 });
const tables = m.addVar({ name: "tables", type: "Integer", lb: 0 });

// Objective: Profit is $30 per chair, $50 per table
m.maximize(chairs.mul(30).add(tables.mul(50)));

// Constraints:
// 1. Carpentry: 1 hr/chair + 2 hrs/table <= 40 hrs
m.addConstraint(chairs.add(tables.mul(2)).le(40), "carpentry_limit");

// 2. Finishing: 2 hrs/chair + 1 hr/table <= 50 hrs
m.addConstraint(chairs.mul(2).add(tables).le(50), "finishing_limit");

// Solve with HiGHS WASM in browser
const status = await m.solve();

console.log("Status:", status);
console.log("Optimal Profit: $" + m.objectiveValue);
console.log("Chairs to produce:", chairs.value);
console.log("Tables to produce:", tables.value);
`,
  },
  {
    id: "knapsack",
    title: "0-1 Knapsack Selection",
    titleJa: "0-1 ナップサック選択問題",
    category: "MIP",
    group: "fundamentals",
    description:
      "Binary integer programming. Select the highest-value combination of items without exceeding the backpack weight limit.",
    descriptionJa:
      "重量上限（7kg）を超えない範囲で価値の合計が最大になるアイテムの組み合わせを0-1変数で選択します。",
    apis: ["addVars(keys)", 'type: "Binary"', "sum()"],
    visualizer: "summary",
    code: `// --- 0-1 Knapsack Selection Problem ---
// Maximize total item value within backpack weight capacity.
const m = new Model({ name: "KnapsackProblem", sense: "Maximize" });

const items = [
  { name: "Laptop",       weight: 3, value: 50 },
  { name: "Camera",       weight: 2, value: 40 },
  { name: "Book",         weight: 1, value: 10 },
  { name: "Water_Bottle", weight: 2, value: 25 },
  { name: "Drone",        weight: 4, value: 65 },
  { name: "First_Aid",    weight: 1, value: 15 },
];
const maxCapacity = 7;

// Binary decision variables (1 = packed, 0 = skipped)
const x = m.addVars(items.map(it => it.name), { type: "Binary" });

// Objective: Maximize total packed value
m.maximize(sum(items, it => x[it.name].mul(it.value)));

// Constraint: Total weight <= maxCapacity (7 kg)
m.addConstraint(
  sum(items, it => x[it.name].mul(it.weight)).le(maxCapacity),
  "capacity_limit"
);

const status = await m.solve();

console.log("Status:", status);
console.log("Max Total Value: $" + m.objectiveValue);
items.forEach(it => {
  if (Math.round(x[it.name].value || 0) === 1) {
    console.log(\`Packed \${it.name} (weight: \${it.weight}kg, value: $\${it.value})\`);
  }
});
`,
  },
  {
    id: "transportation",
    title: "Transportation Network (2D Matrix)",
    titleJa: "輸送・物流ネットワーク問題（2次元変数）",
    category: "LP",
    group: "fundamentals",
    description:
      "2D variable indexing with addVars(factories, stores). Minimize total shipping cost from 3 factories to 4 regional stores.",
    descriptionJa:
      "addVars(factories, stores) による2次元マトリクス変数の構築。3工場から4店舗への総輸送コストを最小化します。",
    apis: ["addVars(rows, cols)", "sum()", "constr.dual"],
    visualizer: "matrix",
    code: `// --- Transportation & Distribution Network (2D Matrix) ---
// 3 Factories (Tokyo, Nagoya, Osaka) -> 4 Regional Stores (North, East, West, South)
const m = new Model({ name: "TransportationNetwork", sense: "Minimize" });

const factories = ["Tokyo", "Nagoya", "Osaka"];
const supplies = { Tokyo: 120, Nagoya: 100, Osaka: 80 };

const stores = ["North", "East", "West", "South"];
const demands = { North: 70, East: 90, West: 60, South: 60 };

// Unit shipping cost matrix ($/unit)
const cost = {
  Tokyo:  { North: 4, East: 2, West: 7, South: 8 },
  Nagoya: { North: 6, East: 4, West: 3, South: 5 },
  Osaka:  { North: 9, East: 7, West: 2, South: 3 },
};

// 2D matrix of continuous shipment variables: ship[factory][store] >= 0
const ship = m.addVars(factories, stores, { lb: 0, prefix: "ship" });

// Objective: Minimize total shipping cost across all routes
const terms = [];
for (const f of factories) {
  for (const s of stores) {
    terms.push(ship[f][s].mul(cost[f][s]));
  }
}
m.minimize(sum(terms));

// Supply constraints: Outgoing shipments from each factory <= supply[f]
for (const f of factories) {
  m.addConstraint(sum(stores.map(s => ship[f][s])).le(supplies[f]), \`supply_\${f}\`);
}

// Demand constraints: Incoming shipments to each store >= demand[s]
for (const s of stores) {
  m.addConstraint(sum(factories.map(f => ship[f][s])).ge(demands[s]), \`demand_\${s}\`);
}

const status = await m.solve();

console.log("Status:", status);
console.log("Min Total Shipping Cost: $" + m.objectiveValue);
for (const f of factories) {
  for (const s of stores) {
    const val = ship[f][s].value;
    if (val && val > 1e-5) {
      console.log(\`  \${f} -> \${s}: \${val} units (@ $\${cost[f][s]}/unit = $\${val * cost[f][s]})\`);
    }
  }
}
`,
  },
  {
    id: "diet_sensitivity",
    title: "Diet & Sensitivity Analysis (Dual / Slack)",
    titleJa: "栄養問題と感度分析（潜在価格 Dual・スラック Slack）",
    category: "LP",
    group: "fundamentals",
    description:
      "Inspect shadow prices (constr.dual), surpluses (constr.slack), and reduced costs (var.reducedCost) to identify cost bottlenecks.",
    descriptionJa:
      "最小コストの献立を求めつつ、どの栄養基準がコストを押し上げているか（潜在価格 dual）や余剰（slack）を分析します。",
    apis: ["constr.dual", "constr.slack", "var.reducedCost"],
    visualizer: "summary",
    code: `// --- Diet Problem & LP Sensitivity Analysis (Duals, Slacks, Reduced Costs) ---
// Minimize daily menu cost while meeting nutritional requirements, then inspect duals.
const m = new Model({ name: "DietSensitivity", sense: "Minimize" });

const foods = [
  { name: "Oats",    cost: 0.60, calories: 150, protein: 5,  calcium: 20,  iron: 1.8 },
  { name: "Chicken", cost: 2.40, calories: 220, protein: 32, calcium: 15,  iron: 1.2 },
  { name: "Eggs",    cost: 0.80, calories: 140, protein: 12, calcium: 50,  iron: 1.7 },
  { name: "Milk",    cost: 0.90, calories: 120, protein: 8,  calcium: 280, iron: 0.1 },
  { name: "Spinach", cost: 1.50, calories: 40,  protein: 4,  calcium: 120, iron: 3.5 },
  { name: "Salmon",  cost: 3.60, calories: 200, protein: 25, calcium: 20,  iron: 0.8 },
];

// Continuous servings per day (0 to 4 servings max per food)
const srv = m.addVars(foods.map(f => f.name), { lb: 0, ub: 4, prefix: "srv" });

// Objective: Minimize daily food cost
m.minimize(sum(foods, f => srv[f.name].mul(f.cost)));

// Nutritional constraints (keep references to inspect .dual and .slack)
const cCal  = m.addConstraint(sum(foods, f => srv[f.name].mul(f.calories)).ge(2000), "min_calories");
const cProt = m.addConstraint(sum(foods, f => srv[f.name].mul(f.protein)).ge(105),   "min_protein");
const cCalc = m.addConstraint(sum(foods, f => srv[f.name].mul(f.calcium)).ge(1000),  "min_calcium");
const cIron = m.addConstraint(sum(foods, f => srv[f.name].mul(f.iron)).ge(18),       "min_iron");

const status = await m.solve();

console.log("Status:", status);
console.log("Minimum Daily Cost: $" + m.objectiveValue?.toFixed(2));
console.log("\\n--- Shadow Prices (Duals) & Slacks ---");
for (const c of [cCal, cProt, cCalc, cIron]) {
  const isBinding = Math.abs(c.slack || 0) < 1e-4;
  console.log(\`  \${c.name.padEnd(14)} | dual: $\${(c.dual || 0).toFixed(4)} | slack: \${Math.abs(c.slack || 0).toFixed(1).padStart(6)} | \${isBinding ? "BINDING (Bottleneck)" : "Surplus"}\`);
}
`,
  },

  // ===========================================================================
  // 2. Practical Applications (Real-World Use Cases)
  // ===========================================================================
  {
    id: "shift_scheduling",
    title: "Staff Shift Scheduling (Weekly Roster)",
    titleJa: "スタッフのシフト作成（必要人数・希望休・連勤制限）",
    category: "MIP",
    group: "practical",
    description:
      "Assign 5 staff members across a 7-day week meeting daily coverage, senior leader rules, max shifts, and day-off requests.",
    descriptionJa:
      "日別の必要人数・リーダー配置・週5日上限・スタッフの希望休をすべて満たしつつ人件費を最小化するシフト表を作成します。",
    apis: ["addVars(staff, days)", 'type: "Binary"', "sum()"],
    visualizer: "roster",
    code: `// --- Staff Shift Scheduling (Weekly Roster Optimization) ---
// Assign 5 staff across Mon..Sun meeting coverage, senior duty, and day-off requests.
const m = new Model({ name: "WeeklyShiftRoster", sense: "Minimize" });

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const requiredCoverage = { Mon: 3, Tue: 3, Wed: 3, Thu: 3, Fri: 4, Sat: 3, Sun: 2 };

const staffList = [
  { name: "Alice",   isSenior: true,  wage: 220, maxShifts: 5 },
  { name: "Bob",     isSenior: true,  wage: 210, maxShifts: 5 },
  { name: "Charlie", isSenior: false, wage: 160, maxShifts: 5 },
  { name: "Diana",   isSenior: false, wage: 160, maxShifts: 5 },
  { name: "Evan",    isSenior: false, wage: 150, maxShifts: 5 },
];

// 2D Binary variables: shift[staff][day] = 1 (On duty), 0 (Off)
const shift = m.addVars(staffList.map(s => s.name), days, { type: "Binary", prefix: "shift" });

// Objective: Minimize total payroll cost (+$30 weekend shift premium)
const costTerms = [];
for (const s of staffList) {
  for (const d of days) {
    const cost = s.wage + (d === "Sat" || d === "Sun" ? 30 : 0);
    costTerms.push(shift[s.name][d].mul(cost));
  }
}
m.minimize(sum(costTerms));

// 1. Daily minimum headcount coverage
for (const d of days) {
  m.addConstraint(sum(staffList, s => shift[s.name][d]).ge(requiredCoverage[d]), \`coverage_\${d}\`);
}

// 2. At least 1 senior staff member on duty every day
const seniors = staffList.filter(s => s.isSenior);
for (const d of days) {
  m.addConstraint(sum(seniors, s => shift[s.name][d]).ge(1), \`senior_duty_\${d}\`);
}

// 3. Max working days per week (<= 5 shifts)
for (const s of staffList) {
  m.addConstraint(sum(days, d => shift[s.name][d]).le(s.maxShifts), \`max_shifts_\${s.name}\`);
}

// 4. Requested days off
const dayOffRequests = [
  { staff: "Alice",   day: "Sun" },
  { staff: "Bob",     day: "Mon" },
  { staff: "Charlie", day: "Sat" },
  { staff: "Diana",   day: "Wed" },
];
for (const req of dayOffRequests) {
  m.addConstraint(shift[req.staff][req.day].le(0), \`day_off_\${req.staff}_\${req.day}\`);
}

const status = await m.solve();
console.log("Status:", status);
console.log("Optimal Weekly Payroll: $" + m.objectiveValue);
`,
  },
  {
    id: "cart_coupon",
    title: "E-Commerce Cart & Coupon Optimizer",
    titleJa: "ECカートのクーポン最適適用（条件付き閾値・追加購入提案）",
    category: "MIP",
    group: "practical",
    description:
      "Client-side checkout optimizer using addIndicator(). Finds the best stackable/exclusive coupons and checks if a $10 filler item unlocks a bigger discount.",
    descriptionJa:
      "addIndicator() を活用し、併用可否や最低購入金額ルールを満たす最安クーポン構成と「あと10ドル追加で上位割引を解放」する提案を計算します。",
    apis: ["addIndicator()", 'type: "Binary"', "sum()"],
    visualizer: "coupon",
    code: `// --- E-Commerce Cart & Coupon Optimizer (Indicator Constraints) ---
// Base cart subtotal is $242 (Tech subtotal: $210).
// Can adding a $10 USB-C cable unlock the $45-off ($250+ tier) coupon for a lower net total?
const m = new Model({ name: "CartCouponOptimizer", sense: "Minimize" });

const baseCartSubtotal = 242;
const baseTechSubtotal = 210;

// Optional $10 add-on item to cross the $250 threshold
const addUsbCable = m.addVar({ name: "addon_USB_Cable", type: "Binary" });
const usbCablePrice = 10;

const coupons = [
  { id: "WELCOME15",  discount: 15, minCart: 100, minTech: 0,   stackable: true  },
  { id: "TECH30",     discount: 30, minCart: 0,   minTech: 200, stackable: false },
  { id: "MEGA45_250", discount: 45, minCart: 250, minTech: 0,   stackable: false },
  { id: "MEMBER10",   discount: 10, minCart: 150, minTech: 0,   stackable: true  },
];

const cpn = m.addVars(coupons.map(c => c.id), { type: "Binary", prefix: "cpn" });

const merchSpend = addUsbCable.mul(usbCablePrice).add(baseCartSubtotal);
const techSpend  = addUsbCable.mul(usbCablePrice).add(baseTechSubtotal);

// 1. Indicator Constraints: If coupon is selected (cpn == 1), minimum spend must hold
for (const c of coupons) {
  if (c.minCart > 0) {
    m.addIndicator(cpn[c.id], merchSpend.ge(c.minCart), { activeValue: 1, M: 500, name: \`min_cart_\${c.id}\` });
  }
  if (c.minTech > 0) {
    m.addIndicator(cpn[c.id], techSpend.ge(c.minTech), { activeValue: 1, M: 500, name: \`min_tech_\${c.id}\` });
  }
}

// 2. Mutual exclusion among non-stackable ("Exclusive") coupons
const exclusive = coupons.filter(c => !c.stackable);
m.addConstraint(sum(exclusive, c => cpn[c.id]).le(1), "exclusive_coupon_limit");

// 3. Max 2 coupons per order
m.addConstraint(sum(coupons, c => cpn[c.id]).le(2), "max_two_coupons");

// Objective: Minimize final net payable amount (merchSpend - discounts)
const totalDiscount = sum(coupons, c => cpn[c.id].mul(c.discount));
m.minimize(merchSpend.sub(totalDiscount));

const status = await m.solve();

console.log("Status:", status);
console.log("Final Net Payable: $" + m.objectiveValue + " (Base Cart was $" + baseCartSubtotal + ")");
console.log("Add $10 USB-C Cable?:", Math.round(addUsbCable.value || 0) === 1 ? "YES (Unlocks $250 tier!)" : "NO");
coupons.forEach(c => {
  if (Math.round(cpn[c.id].value || 0) === 1) {
    console.log(\`  Applied Coupon: \${c.id} (-$\${c.discount})\`);
  }
});
`,
  },
  {
    id: "portfolio_qp",
    title: "Markowitz Portfolio Optimization (Convex QP)",
    titleJa: "マーコウィッツのポートフォリオ最適化（凸二次計画 QP）",
    category: "QP",
    group: "practical",
    description:
      "Convex Quadratic Programming (QP). Minimize investment portfolio variance risk subject to 100% budget and target return constraints.",
    descriptionJa:
      "資産間の共分散行列に基づくポートフォリオ分散（リスク）を、期待リターン下限と予算制約の下で最小化します。",
    apis: ["new QuadExpr()", "v1.mul(v2)", "sum()"],
    visualizer: "summary",
    code: `// --- Markowitz Portfolio Optimization (Convex QP) ---
// Minimize portfolio variance risk subject to capital and target return constraints.
const m = new Model({ name: "PortfolioOptimization", sense: "Minimize" });

// 1. Asset universe and expected returns
const assets = ["Tech", "Bonds", "GlobalEq", "RealEstate", "Gold"];
const expectedReturns = [0.15, 0.04, 0.10, 0.08, 0.06];

// Asset weight decision variables: 0% <= w_i <= 100%
const w = assets.map((name) => m.addVar({ name: \`weight_\${name}\`, lb: 0, ub: 1 }));

// 2. Budget constraint: sum of weights = 1.0 (100% capital allocation)
m.addConstraint(sum(w).eq(1.0), "budget_full_investment");

// 3. Minimum expected return target: sum(r_i * w_i) >= 9.0%
const portfolioReturn = sum(w.map((v, i) => v.mul(expectedReturns[i])));
m.addConstraint(portfolioReturn.ge(0.09), "min_expected_return");

// 4. Covariance Matrix (risk & asset correlations)
const cov = [
  [0.040, 0.002, 0.025, 0.015, 0.005], // Tech
  [0.002, 0.005, 0.003, 0.002, 0.001], // Bonds
  [0.025, 0.003, 0.030, 0.018, 0.008], // GlobalEq
  [0.015, 0.002, 0.018, 0.025, 0.004], // RealEstate
  [0.005, 0.001, 0.008, 0.004, 0.020], // Gold
];

// Quadratic Objective: Minimize portfolio variance w^T * Cov * w
let risk = new QuadExpr();
for (let i = 0; i < assets.length; i++) {
  for (let j = 0; j < assets.length; j++) {
    if (cov[i][j] !== 0) {
      risk = risk.add(w[i].mul(w[j]).mul(cov[i][j]));
    }
  }
}
m.minimize(risk);

const status = await m.solve();

console.log("Solve Status:", status);
console.log("Optimal Variance (Risk):", m.objectiveValue?.toFixed(6));
console.log("Annualized Volatility:", (Math.sqrt(m.objectiveValue || 0) * 100).toFixed(2) + "%");
assets.forEach((name, i) => {
  console.log(\`  \${name.padEnd(12)}: \${((w[i].value || 0) * 100).toFixed(2)}%\`);
});
`,
  },
  {
    id: "glpk_diet_problem",
    title: "Stigler Diet Problem (GLPK Plugin)",
    titleJa: "スティグラーの栄養問題（GLPK ソルバープラグイン）",
    category: "LP",
    group: "fundamentals",
    description:
      "Classic linear programming diet cost minimization solved using the pluggable GNU Linear Programming Kit (GLPK) WebAssembly engine.",
    descriptionJa:
      "プラガブルな GLPK WebAssembly エンジン（solver: 'glpk'）に切り替えて古典的な栄養問題を求解します。",
    apis: ['solver: "glpk"', "m.optimize()"],
    visualizer: "summary",
    code: `// --- Diet Optimization via GLPK Solver Plugin ---
// Switch seamlessly to GLPK solver via solver: "glpk"
const m = new Model({ name: "DietProblem", sense: "Minimize", solver: "glpk" });

// Food item decision variables (quantities >= 0)
const bread = m.addVar({ name: "bread", lb: 0, ub: 10 });     // $2.00 / loaf
const milk = m.addVar({ name: "milk", lb: 0, ub: 10 });       // $3.50 / bottle
const cheese = m.addVar({ name: "cheese", lb: 0, ub: 5 });    // $5.00 / pack

// Objective: Minimize total basket cost
m.minimize(bread.mul(2.0).add(milk.mul(3.5)).add(cheese.mul(5.0)));

// Nutritional requirements
m.addConstraint(bread.mul(300).add(milk.mul(250)).add(cheese.mul(400)).ge(2000), "Calories_min");
m.addConstraint(bread.mul(10).add(milk.mul(15)).add(cheese.mul(25)).ge(70), "Protein_min");
m.addConstraint(bread.mul(50).add(milk.mul(300)).add(cheese.mul(500)).ge(800), "Calcium_min");

console.log("Solving with GLPK plugin engine...");
const status = await m.optimize();

console.log("Status:", status);
console.log("Optimal Cost: $" + m.objectiveValue?.toFixed(2));
console.log("Bread loaves:", bread.value?.toFixed(2));
console.log("Milk bottles:", milk.value?.toFixed(2));
console.log("Cheese packs:", cheese.value?.toFixed(2));
`,
  },

  // ===========================================================================
  // 3. SMT Logic & Conflict Diagnosis (Z3 Engine)
  // ===========================================================================
  {
    id: "shift_conflict_unsat",
    title: "Shift Vacation Conflict Diagnosis (Z3 Unsat Core)",
    titleJa: "シフト希望休の衝突診断（Z3 Unsat Core）",
    category: "SMT",
    group: "logic",
    description:
      "When too many staff members request Saturday off, Z3 isolates the conflicting constraint subset (coverage_Sat vs specific Saturday vacation requests).",
    descriptionJa:
      "土曜日の希望休が重なりシフトが組めない（解なし）際、Z3 の unsatCore でどの必須人数枠と誰の希望休が衝突したかを特定します。",
    apis: ["m.check()", "m.unsatCore", 'solver: "z3"'],
    visualizer: "none",
    code: `// --- Shift Scheduling Vacation Conflict Diagnosis (Z3 Unsat Core) ---
// When Saturday coverage requires 3 staff out of 5, but 3 staff members request Saturday off,
// Z3 isolates the conflicting constraint subset (excluding unrelated weekday rules).
const m = new Model({ name: "ShiftConflictDiagnosis", solver: "z3" });

const staff = ["Alice", "Bob", "Charlie", "Diana", "Evan"];
const days = ["Fri", "Sat", "Sun"];

const shift = m.addVars(staff, days, { type: "Integer", lb: 0, ub: 1, prefix: "shift" });

// Daily coverage requirements
m.addConstraint(sum(staff, s => shift[s]["Fri"]).ge(3), "coverage_Fri");
m.addConstraint(sum(staff, s => shift[s]["Sat"]).ge(3), "coverage_Sat");
m.addConstraint(sum(staff, s => shift[s]["Sun"]).ge(2), "coverage_Sun");

// Vacation requests: 3 staff request Saturday off -> leaves at most 2 staff for Saturday!
m.addConstraint(shift["Alice"]["Sat"].le(0),   "day_off_Alice_Sat");
m.addConstraint(shift["Bob"]["Sat"].le(0),     "day_off_Bob_Sat");
m.addConstraint(shift["Charlie"]["Sat"].le(0), "day_off_Charlie_Sat");

// Unrelated Friday request (innocent bystander rule)
m.addConstraint(shift["Diana"]["Fri"].le(0),   "day_off_Diana_Fri");

console.log("Checking shift schedule feasibility with Z3...");
const res = await m.check({ solver: "z3" });

console.log("Check Status:", res.status); // "Unsat"
if (res.status === "Unsat") {
  console.warn("⚠️ Conflicting Shift Rules (Unsat Core):");
  m.unsatCore.forEach((rule) => console.warn("  • " + rule));
}
`,
  },
  {
    id: "conflict_diagnosis_unsat",
    title: "Rule Conflict Diagnosis (Budget vs Staffing Unsat Core)",
    titleJa: "業務ルールの矛盾診断（予算上限と人員要件の Unsat Core）",
    category: "SMT",
    group: "logic",
    description:
      "Constraint conflict diagnosis with Z3. Isolates a subset of incompatible rules (unsat core) causing infeasibility.",
    descriptionJa:
      "特急納期の人員ルールと取締役会の予算上限が矛盾した際、原因となっている制約サブセット（Unsat Core）を抽出します。",
    apis: ["addBoolVar()", "implies()", "m.unsatCore"],
    visualizer: "none",
    code: `// --- Conflict Diagnosis & Unsat Core Extraction ---
// Demonstrates Z3 SMT engine isolating the exact contradictory rules
const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

// Decision Variables: Project Staffing & Budget
const engineers = m.addVar({ name: "engineers", type: "Integer", lb: 0, ub: 20 });
const budget = m.addVar({ name: "budget", type: "Continuous", lb: 0, ub: 100000 });
const rushDelivery = m.addBoolVar("rushDelivery");

// Rule 1: Each engineer costs $8,000
m.addConstraint(engineers.mul(8000).le(budget), "budget_limit");

// Rule 2: Client strictly requires rush delivery
m.addConstraint(rushDelivery, "rush_required");

// Rule 3: Rush delivery requires at least 8 engineers
m.addConstraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

// Rule 4: Board of Directors budget cap: $50,000
// Note: 8 engineers * $8,000 = $64,000 > $50,000 budget! (CONFLICT!)
m.addConstraint(budget.le(50000), "strict_board_budget_cap");

// Rule 5: Completely independent regulation (unrelated to conflict)
m.addConstraint(engineers.ge(1), "minimum_one_employee");

// Solve feasibility & extract conflict core
console.log("Checking rule feasibility with Z3 SMT engine...");
const res = await m.check({ solver: "z3" });

console.log("Check Status:", res.status); // "Unsat"

if (res.status === "Unsat") {
  console.warn("⚠️ Conflicting Rules (Unsat Core):");
  m.unsatCore.forEach((rule) => console.warn("  • " + rule));
}
`,
  },
  {
    id: "smt_sat_scheduling",
    title: "Task Scheduling & Logic Feasibility (SMT / SAT)",
    titleJa: "タスク割り当てと論理充足性検証（SMT / SAT）",
    category: "SMT",
    group: "logic",
    description:
      "Satisfiability (SAT) checking with Z3. Finds a valid schedule satisfying mutual exclusion and logical implication constraints.",
    descriptionJa:
      "排他条件（xor, not）や含意（implies）を含む論理・算術混合制約を満たす割り当てを Z3 で検証します。",
    apis: ["addBoolVar()", "xor()", "implies()", "m.check()"],
    visualizer: "none",
    code: `// --- SMT / SAT Logic Satisfiability ---
// Demonstrates Z3 finding satisfying assignments for boolean & integer constraints
const m = new Model({ name: "TaskScheduling", solver: "z3" });

// Boolean decisions: which server executes Task A and Task B
const taskA_s1 = m.addBoolVar("taskA_s1");
const taskA_s2 = m.addBoolVar("taskA_s2");
const taskB_s1 = m.addBoolVar("taskB_s1");
const taskB_s2 = m.addBoolVar("taskB_s2");

// Task A must be assigned to exactly one server
m.addConstraint(taskA_s1.xor(taskA_s2), "taskA_assignment");
// Task B must be assigned to exactly one server
m.addConstraint(taskB_s1.xor(taskB_s2), "taskB_assignment");
// Cannot run both Task A and Task B on Server 1 simultaneously
m.addConstraint(taskA_s1.and(taskB_s1).not(), "server1_capacity");

// Worker hours (integer)
const hours = m.addVar({ name: "worker_hours", type: "Integer", lb: 1, ub: 8 });
// If Task A is on Server 2, requires at least 4 hours
m.addConstraint(taskA_s2.implies(hours.ge(4)), "s2_overtime_rule");

console.log("Checking feasibility with Z3 SMT engine...");
const res = await m.check({ solver: "z3" });

console.log("Check Status:", res.status); // "Sat"
console.log("Satisfying Model:");
console.log("  taskA on S1:", taskA_s1.value);
console.log("  taskA on S2:", taskA_s2.value);
console.log("  taskB on S1:", taskB_s1.value);
console.log("  taskB on S2:", taskB_s2.value);
console.log("  worker_hours:", hours.value);
`,
  },
];
