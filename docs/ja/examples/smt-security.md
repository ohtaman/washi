# セキュリティポリシーと論理検証 (Z3 SMT)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 命題論理・SMT 充足性判定 | Z3 (`@ohtaman/washi/solvers/z3`) | `m.addBoolVar()`, `.implies()`, `.and()`, `m.check()` | [Playground で開く](https://ohtaman.github.io/washi/demo/?preset=smt_sat_scheduling) · [ソースコード](https://github.com/ohtaman/washi/blob/main/examples/node/04-smt-security-rules.ts) |

真偽値変数（`BoolVar`）と数値変数（`Var`）を組み合わせ、「もし照度が 50 以下なら夜間モードにする (`lux.le(50).implies(isNight)`)」といった複合的な業務ルール・セキュリティポリシーの充足性を Z3 ソルバーで検証します。

---

## WaSHI による実装

```typescript
import { Model } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function verifySecurityRules() {
  const m = new Model({ name: "SmartSecurityRules", solver: "z3" });

  const isNight = m.addBoolVar("isNight");
  const motion  = m.addBoolVar("motion");
  const alarm   = m.addBoolVar("alarm");
  const siren   = m.addBoolVar("siren");
  const lux     = m.addVar({ name: "lux", type: "Integer", lb: 0 });

  // 論理ルール
  m.addConstraint(lux.le(50).implies(isNight), "dark_implies_night");
  m.addConstraint(motion.and(isNight).and(alarm).implies(siren), "alarm_rule");

  // センサー観測値
  m.addConstraint(lux.le(10), "sensor_dark");
  m.addConstraint(motion, "sensor_motion");
  m.addConstraint(alarm, "alarm_on");

  const res = await m.check({ solver: "z3" });
  console.log(`Status: ${res.status}, Siren active: ${siren.value}`);
}

verifySecurityRules();
```
