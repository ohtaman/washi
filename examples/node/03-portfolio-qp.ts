/**
 * Example 3: Markowitz Mean-Variance Portfolio Optimization (Convex QP)
 * 
 * Demonstrates:
 * - Continuous allocation weights (0% to 100%)
 * - Quadratic objective function using QuadExpr (minimizing portfolio variance)
 * - Native QP solving with HiGHS
 * 
 * Run with: npx tsx examples/node/03-portfolio-qp.ts
 */

import { Model, sum, dot, expr, QuadExpr } from "../../src/index.js";

async function main() {
  console.log("=== Markowitz Portfolio Optimization (Convex QP) ===");

  const m = new Model("PortfolioQP");

  const assets = ["Tech", "Bonds", "GlobalEq", "RealEstate", "Gold"];
  const expectedReturns = [0.12, 0.04, 0.09, 0.07, 0.05];

  // Covariance matrix between asset returns
  const cov = [
    [0.040, 0.002, 0.025, 0.015, 0.005], // Tech
    [0.002, 0.005, 0.003, 0.002, 0.001], // Bonds
    [0.025, 0.003, 0.030, 0.018, 0.008], // GlobalEq
    [0.015, 0.002, 0.018, 0.025, 0.004], // RealEstate
    [0.005, 0.001, 0.008, 0.004, 0.020], // Gold
  ];

  // Allocation weights w_i in [0, 1]
  const w = m.continuous(assets, { lb: 0, ub: 1 });

  // Budget constraint: sum(w) == 1.0 (100% total capital)
  m.constrain(expr`${sum(assets, (a) => w[a])} == 1.0`, "budget_full_allocation");

  // Target expected return: sum(r_i * w_i) >= 8.5%
  const returns = Object.fromEntries(assets.map((name, i) => [name, expectedReturns[i]]));
  m.constrain(expr`${dot(returns, w)} >= 0.085`, "min_expected_return");

  // Objective: Minimize portfolio variance w^T * Cov * w
  let risk = new QuadExpr();
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      if (cov[i][j] !== 0) {
        risk = risk.add(w[assets[i]].mul(w[assets[j]]).mul(cov[i][j]));
      }
    }
  }
  m.minimize(risk);

  const status = await m.optimize();

  console.log(`\nStatus: ${status}`);
  console.log(`Optimal Variance (Risk): ${m.objectiveValue?.toFixed(6)}`);
  console.log(`Portfolio Volatility (Std Dev): ${((Math.sqrt(m.objectiveValue || 0)) * 100).toFixed(2)}%`);
  console.log("\nAsset Allocations:");
  assets.forEach((name) => {
    const pct = ((w[name].value || 0) * 100).toFixed(2);
    console.log(`  ${name.padEnd(12)}: ${pct}%`);
  });
}

main().catch(console.error);
