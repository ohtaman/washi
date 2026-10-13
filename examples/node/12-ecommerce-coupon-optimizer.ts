/**
 * Example 12: E-Commerce Cart & Coupon Optimizer (Client-Side MIP with Indicators)
 *
 * Demonstrates:
 * - Conditional activation constraints via `m.indicator(binVar, constraint, { activeValue, M })`
 * - Mutual exclusion between promotional coupons (`c1 + c2 <= 1`)
 * - Determining whether adding a small "filler" item unlocks a higher discount tier
 *   that reduces the customer's net payable amount
 *
 * Solver: HiGHS (default MIP engine)
 * Run with: npx tsx examples/node/12-ecommerce-coupon-optimizer.ts
 */

import { Model, sum, expr, c, minimize } from "../../src/index.js";

async function main() {
  console.log("=== E-Commerce Cart & Coupon Optimizer (MIP) ===");
  const t0 = performance.now();

  const m = new Model("CartCouponOptimizer");

  // Current items in the customer's shopping cart:
  // - Noise-Canceling Headphones (Tech): $160
  // - Mechanical Keypad (Tech):          $50
  // - Canvas Backpack (Apparel):         $32
  // Base Cart Subtotal = $242 (Tech subtotal = $210)
  const baseCartSubtotal = 242;
  const baseTechSubtotal = 210;

  // Optional add-on filler item the checkout UI can suggest:
  // - Braided USB-C Cable ($10) -> pushes total cart spend from $242 to $252!
  const addUsbCable = m.binary("addon_USB_Cable");
  const usbCablePrice = 10;

  // Available promotional coupons (Binary: 1 = applied, 0 = not applied)
  const coupons = [
    { id: "WELCOME15",   discount: 15, minCartSpend: 100, minTechSpend: 0,   stackable: true,  desc: "$15 off orders >= $100 (Stackable)" },
    { id: "TECH30",      discount: 30, minCartSpend: 0,   minTechSpend: 200, stackable: false, desc: "$30 off Tech >= $200 (Exclusive)" },
    { id: "MEGA45_250",  discount: 45, minCartSpend: 250, minTechSpend: 0,   stackable: false, desc: "$45 off total cart >= $250 (Exclusive)" },
    { id: "MEMBER10",    discount: 10, minCartSpend: 150, minTechSpend: 0,   stackable: true,  desc: "$10 loyalty bonus >= $150 (Stackable)" },
  ];

  const useCoupon = m.binary(coupons.map((c) => c.id));

  // Total merchandise spend (base cart + optional add-on item)
  const merchSpend = addUsbCable.mul(usbCablePrice).add(baseCartSubtotal);
  const techSpend = addUsbCable.mul(usbCablePrice).add(baseTechSubtotal);

  // Rule 1: Indicator constraints — if coupon `c` is applied (useCoupon[c.id] == 1),
  // the cart must satisfy its minimum spend threshold.
  for (const cpn of coupons) {
    if (cpn.minCartSpend > 0) {
      m.indicator(useCoupon[cpn.id], merchSpend.ge(cpn.minCartSpend), {
        activeValue: 1,
        M: 500,
        name: `min_spend_${cpn.id}`,
      });
    }
    if (cpn.minTechSpend > 0) {
      m.indicator(useCoupon[cpn.id], techSpend.ge(cpn.minTechSpend), {
        activeValue: 1,
        M: 500,
        name: `min_tech_${cpn.id}`,
      });
    }
  }

  // Rule 2: Mutual exclusion among non-stackable ("Exclusive") coupons
  const exclusiveCoupons = coupons.filter((c) => !c.stackable);
  m.constraint(
    c`${sum(exclusiveCoupons, (c) => useCoupon[c.id])} <= 1`,
    "at_most_one_exclusive_coupon"
  );

  // Rule 3: Maximum 2 coupons total per checkout
  m.constraint(
    c`${sum(coupons, (c) => useCoupon[c.id])} <= 2`,
    "max_two_coupons_total"
  );

  // Objective: Minimize final net payable amount = merchSpend - totalDiscounts
  const totalDiscount = sum(coupons, (c) => useCoupon[c.id].mul(c.discount));
  m.objective(minimize(merchSpend.sub(totalDiscount)));

  const buildMs = performance.now() - t0;
  const status = await m.solve();
  const solveMs = m.runTime * 1000;

  const cableAdded = Math.round(addUsbCable.value ?? 0) === 1;
  const grossTotal = baseCartSubtotal + (cableAdded ? usbCablePrice : 0);
  const netPayable = m.objectiveValue ?? grossTotal;
  const discountSaved = grossTotal - netPayable;

  console.log(`\nStatus: ${status} (model build: ${buildMs.toFixed(2)}ms, solve: ${solveMs.toFixed(2)}ms)`);
  console.log(`Base Cart Subtotal:    $${baseCartSubtotal.toFixed(2)}`);
  console.log(
    `Recommended Add-on:    ${cableAdded ? `YES (+$${usbCablePrice} Braided USB-C Cable to unlock $250 tier)` : "None"}`
  );
  console.log(`Gross Merchandise:     $${grossTotal.toFixed(2)}`);
  console.log(`Total Coupon Savings: -$${discountSaved.toFixed(2)}`);
  console.log(`Final Payable Total:   $${netPayable.toFixed(2)} (saved $${(baseCartSubtotal - netPayable).toFixed(2)} vs base cart!)\n`);

  console.log("Coupon Selection Breakdown:");
  for (const cpn of coupons) {
    const applied = Math.round(useCoupon[cpn.id].value ?? 0) === 1;
    console.log(
      `  ${applied ? "✅ [APPLIED] " : "   [skipped] "} ${cpn.id.padEnd(12)} (-$${cpn.discount}) — ${cpn.desc}`
    );
  }
}

main().catch(console.error);
