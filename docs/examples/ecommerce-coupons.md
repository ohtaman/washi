# E-Commerce Cart & Coupon Optimizer (Indicator MIP)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Mixed-Integer Programming (MIP) | HiGHS (default) | `m.addIndicator()`, `type: "Binary"`, `sum()` | [Open in Playground](https://ohtaman.github.io/washi/demo/?preset=cart_coupon) · [Source Code](https://github.com/ohtaman/washi/blob/main/examples/node/12-ecommerce-coupon-optimizer.ts) |

Modern e-commerce checkouts often feature complex promotional rules: minimum spend thresholds, category-specific discounts, stackable vs. mutually exclusive coupons, and maximum coupon limits per order. Running an optimizer directly in the browser (or an edge worker) lets the checkout UI automatically apply the best coupon combination—and even recommend a small "filler" item when crossing a spend threshold lowers the customer's net bill.

This example demonstrates **`m.addIndicator(binVar, constraint, { activeValue, M })`**, which automatically linearizes conditional *"if coupon is selected, minimum spend must hold"* constraints using Big-M reformulation for MIP solvers like HiGHS.

<EcommerceCouponDemo />

---

## Scenario & Promotion Rules

A customer's shopping cart currently contains **$242** of merchandise (**$210** in Tech items and **$32** in Apparel):
- **Optional Filler Add-on:** A **$10** Braided USB-C Cable (Tech) can be added to bring the cart total from `$242` to `$252`.
- **Available Coupons** (maximum **2 coupons** total per checkout; at most **1 Exclusive** coupon):

| Coupon Code | Discount | Condition | Stacking Rule |
| :--- | :---: | :--- | :--- |
| `WELCOME15` | **-$15** | Total cart spend $\ge \$100$ | **Stackable** |
| `TECH30` | **-$30** | Tech category spend $\ge \$200$ | **Exclusive** (cannot combine with `MEGA45_250`) |
| `MEGA45_250` | **-$45** | Total cart spend $\ge \$250$ | **Exclusive** (cannot combine with `TECH30`) |
| `MEMBER10` | **-$10** | Total cart spend $\ge \$150$ | **Stackable** |

Without adding the `$10` cable, the cart (`$242`) cannot use `MEGA45_250` and pays `$242 - $30 (TECH30) - $15 (WELCOME15) = $197`.  
By adding the `$10` cable (`$252` gross), the customer unlocks `MEGA45_250` (`-$45`) + `WELCOME15` (`-$15`) for a net total of **$192**—saving an extra **$5** while getting an extra item!

---

## Implementation in WaSHI

```typescript
import { Model, sum } from "@ohtaman/washi";

async function optimizeCheckoutCart() {
  const m = new Model({ name: "CartCouponOptimizer", sense: "Minimize" });

  const baseCartSubtotal = 242;
  const baseTechSubtotal = 210;

  // Binary decision: add optional $10 USB-C cable to unlock $250 tier?
  const addUsbCable = m.addVar({ name: "addon_USB_Cable", type: "Binary" });
  const usbCablePrice = 10;

  const coupons = [
    { id: "WELCOME15",  discount: 15, minCart: 100, minTech: 0,   stackable: true  },
    { id: "TECH30",     discount: 30, minCart: 0,   minTech: 200, stackable: false },
    { id: "MEGA45_250", discount: 45, minCart: 250, minTech: 0,   stackable: false },
    { id: "MEMBER10",   discount: 10, minCart: 150, minTech: 0,   stackable: true  },
  ];

  // Binary decision variables for each coupon
  const useCoupon = m.addVars(coupons.map((c) => c.id), { type: "Binary", prefix: "cpn" });

  const merchSpend = addUsbCable.mul(usbCablePrice).add(baseCartSubtotal);
  const techSpend  = addUsbCable.mul(usbCablePrice).add(baseTechSubtotal);

  // 1. Indicator constraints: If useCoupon[id] == 1, minimum spend threshold must hold
  for (const cpn of coupons) {
    if (cpn.minCart > 0) {
      m.addIndicator(useCoupon[cpn.id], merchSpend.ge(cpn.minCart), {
        activeValue: 1,
        M: 500,
        name: `min_spend_${cpn.id}`,
      });
    }
    if (cpn.minTech > 0) {
      m.addIndicator(useCoupon[cpn.id], techSpend.ge(cpn.minTech), {
        activeValue: 1,
        M: 500,
        name: `min_tech_${cpn.id}`,
      });
    }
  }

  // 2. Mutual exclusion among non-stackable ("Exclusive") coupons
  const exclusiveCoupons = coupons.filter((c) => !c.stackable);
  m.addConstraint(sum(exclusiveCoupons, (c) => useCoupon[c.id]).le(1), "at_most_one_exclusive");

  // 3. Max 2 coupons per order
  m.addConstraint(sum(coupons, (c) => useCoupon[c.id]).le(2), "max_two_coupons");

  // Objective: Minimize final net payable amount (merchSpend - totalDiscounts)
  const totalDiscount = sum(coupons, (c) => useCoupon[c.id].mul(c.discount));
  m.minimize(merchSpend.sub(totalDiscount));

  await m.solve();
  console.log(`Optimal Net Payable: $${m.objectiveValue}`);
}

optimizeCheckoutCart();
```

---

## Expected Output

```text
Status: Optimal (model build: 0.71ms, solve: 21.99ms)
Base Cart Subtotal:    $242.00
Recommended Add-on:    YES (+$10 Braided USB-C Cable to unlock $250 tier)
Gross Merchandise:     $252.00
Total Coupon Savings: -$60.00
Final Payable Total:   $192.00 (saved $50.00 vs base cart!)

Coupon Selection Breakdown:
  ✅ [APPLIED]  WELCOME15    (-$15) — $15 off orders >= $100 (Stackable)
     [skipped]  TECH30       (-$30) — $30 off Tech >= $200 (Exclusive)
  ✅ [APPLIED]  MEGA45_250   (-$45) — $45 off total cart >= $250 (Exclusive)
     [skipped]  MEMBER10     (-$10) — $10 loyalty bonus >= $150 (Stackable)
```
