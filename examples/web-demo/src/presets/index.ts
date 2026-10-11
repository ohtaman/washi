export interface ExampleModel {
  id: string;
  title: string;
  category: "LP" | "MIP" | "QP" | "SMT";
  description: string;
  code: string;
  visualizer?: "summary" | "none";
}

export const EXAMPLES: ExampleModel[] = [
  {
    id: "production",
    title: "Production Planning (Chairs & Tables)",
    category: "MIP",
    description: "Classic workshop resource allocation. Maximize total profit from producing chairs and tables subject to carpentry and finishing labor limits.",
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
    category: "MIP",
    description: "Binary integer programming. Select the most valuable combination of items without exceeding the backpack weight capacity limit.",
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
    title: "Transportation & Distribution Network",
    category: "LP",
    description: "Linear programming. Minimize total shipping costs from 2 factories to 3 distribution stores subject to supply capacities and customer demands.",
    visualizer: "summary",
    code: `// --- Transportation & Distribution Problem ---
// 2 Factories (Supply: F1=30, F2=40) -> 3 Stores (Demand: S1=20, S2=25, S3=25)
const m = new Model({ name: "TransportationNetwork", sense: "Minimize" });

const factories = ["Factory1", "Factory2"];
const supplies = { Factory1: 30, Factory2: 40 };

const stores = ["StoreA", "StoreB", "StoreC"];
const demands = { StoreA: 20, StoreB: 25, StoreC: 25 };

// Unit shipping cost matrix ($/unit)
const cost = {
  Factory1: { StoreA: 3, StoreB: 5, StoreC: 7 },
  Factory2: { StoreA: 6, StoreB: 4, StoreC: 2 },
};

// Continuous shipment variables x[f][s] >= 0
const x = m.addVars(factories, stores, { lb: 0, prefix: "ship" });

// Objective: Minimize total shipping cost
const terms = [];
for (const f of factories) {
  for (const s of stores) {
    terms.push(x[f][s].mul(cost[f][s]));
  }
}
m.minimize(sum(terms));

// Supply constraints: sum_s x[f][s] <= supply[f]
for (const f of factories) {
  const outgoing = stores.map(s => x[f][s]);
  m.addConstraint(sum(outgoing).le(supplies[f]), \`supply_\${f}\`);
}

// Demand constraints: sum_f x[f][s] >= demand[s]
for (const s of stores) {
  const incoming = factories.map(f => x[f][s]);
  m.addConstraint(sum(incoming).ge(demands[s]), \`demand_\${s}\`);
}

const status = await m.solve();

console.log("Status:", status);
console.log("Min Total Cost: $" + m.objectiveValue);
for (const f of factories) {
  for (const s of stores) {
    const val = x[f][s].value;
    if (val && val > 0) {
      console.log(\`Ship \${val} units from \${f} to \${s} (cost $\${cost[f][s]}/unit)\`);
    }
  }
}
`,
  },
  {
    id: "portfolio_qp",
    title: "Markowitz Portfolio Optimization (Convex QP)",
    category: "QP",
    description: "Convex Quadratic Programming (QP). Minimize investment portfolio variance (covariance risk) subject to 100% budget and target return constraints.",
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
    id: "smt_sat_scheduling",
    title: "Task Scheduling & Logic Feasibility (SMT / SAT)",
    category: "SMT",
    description: "Satisfiability (SAT) checking with Z3. Finds a valid schedule satisfying mutual exclusion and dependency constraints.",
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
  {
    id: "conflict_diagnosis_unsat",
    title: "Rule Conflict Diagnosis (SMT / Unsat Core)",
    category: "SMT",
    description: "Constraint conflict diagnosis with Z3. Automatically isolates a subset of incompatible rules (unsat core) causing infeasibility.",
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
    id: "glpk_diet_problem",
    title: "Stigler Diet Problem (GLPK Engine)",
    category: "LP",
    description: "Classic linear programming diet cost minimization solved using the pluggable GNU Linear Programming Kit (GLPK) WebAssembly engine.",
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
];
