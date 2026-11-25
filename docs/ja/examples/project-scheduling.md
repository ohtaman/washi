# リソース制約付きプロジェクトスケジューリング (CP / Pumpkin)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| 制約プログラミング (RCPSP) / Unsat Core 診断 | Pumpkin (`@ohtaman/washi/solvers/pumpkin`) | `m.integer()`, `disjoint()`, `cumulative()`, `max()`, `and()`, `m.check()` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=project_scheduling">Playground (スケジュール)</a></li><li><a href="https://washi.ohtaman.dev/demo/?preset=project_conflict_unsat">Playground (競合診断)</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts">ソースコード</a></li><li><a href="/ja/guide/constraint-programming">CP モデリングガイド</a></li></ul> |

**リソース制約付きプロジェクトスケジューリング問題（RCPSP）**では、最大完了時刻である**メイクスパン**を最小化する工程スケジュールを求めます。作業の先行順序、単一設備の排他利用、チーム人数の上限を同時に満たす必要があります。

同梱の **Pumpkin** ソルバー（`@ohtaman/washi/solvers/pumpkin`）を使うと、次の 2 点を簡潔に実現できます。
1. 各作業に開始時刻の整数変数 `start[task]` を 1 つ置くだけで済み、時刻ごとの 0-1 変数を大量に作る必要がありません。
2. 点検期間や厳しい納期制約を追加して実行不能になった場合も、同じモデルで `m.check()` を呼ぶだけで矛盾原因（`unsatCore`）を特定できます。

## 問題設定

開始時刻の上限を `24` 時間（`horizon = 24`）として、**6 つのハードウェア試作工程** を配置します。同時稼働できる技術者数の上限は `crewCapacity = 3` 名で、共有試験・校正リグは 1 基だけです。

| 工程 | 所要時間 | 要員数 | 先行工程 | 共有リグ (`disjoint`) |
| :--- | :--- | :--- | :--- | :--- |
| `chassis` | 4h | 2 名 | — | なし |
| `board` | 3h | 2 名 | — | なし |
| `firmware` | 4h | 1 名 | — | **使用** |
| `assembly` | 3h | 2 名 | `chassis`, `board` | なし |
| `calib` | 3h | 1 名 | `board` | **使用** |
| `test` | 2h | 2 名 | `assembly`, `firmware`, `calib` | **使用** |

人員上限を無視すれば、`chassis` と `board` を時刻 `0h` から並行して開始でき、クリティカルパス長は `9h`（`chassis 4h -> assembly 3h -> test 2h`）です。しかし `crewCapacity = 3` のため、それぞれ 2 名を要する `chassis` と `board` は同時に進められません（`2 + 2 = 4 > 3`）。両工程を順番に実施すると `assembly` の開始が `7h` まで後ろ倒しになり、最小メイクスパンは `9h` から **`12h`** に延びます。

## WaSHI による実装

<CodeRunner preset="project_scheduling">

```typescript
import { Model, expr, disjoint, cumulative, max, and, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

async function runProjectScheduling() {
  const horizon = 24;
  const crewCapacity = 3;
  const tasks = [
    { id: "chassis", duration: 4, crew: 2, usesRig: false },
    { id: "board", duration: 3, crew: 2, usesRig: false },
    { id: "firmware", duration: 4, crew: 1, usesRig: true },
    { id: "assembly", duration: 3, crew: 2, usesRig: false },
    { id: "calib", duration: 3, crew: 1, usesRig: true },
    { id: "test", duration: 2, crew: 2, usesRig: true },
  ] as const;

  const m = new Model("PrototypeRCPSP", { solver: "pumpkin" });
  const start = m.integer(tasks.map((t) => t.id), { lb: 0, ub: horizon, prefix: "start" });

  // 1. 先行順序制約
  m.constraint(expr`${start.chassis} + 4 <= ${start.assembly}`, "assembly_after_chassis");
  m.constraint(expr`${start.board} + 3 <= ${start.assembly}`, "assembly_after_board");
  m.constraint(expr`${start.board} + 3 <= ${start.calib}`, "calib_after_board");
  m.constraint(expr`${start.assembly} + 3 <= ${start.test}`, "test_after_assembly");
  m.constraint(expr`${start.firmware} + 4 <= ${start.test}`, "test_after_firmware");
  m.constraint(expr`${start.calib} + 3 <= ${start.test}`, "test_after_calib");

  // 2. 共有試験・校正リグの排他利用（disjoint）と技術者 3 名の上限（cumulative）
  m.constraint(
    disjoint(tasks.filter((t) => t.usesRig).map((t) => ({ start: start[t.id], duration: t.duration }))),
    "single_rig"
  );
  m.constraint(
    cumulative(
      tasks.map((t) => ({ start: start[t.id], duration: t.duration, demand: t.crew })),
      crewCapacity
    ),
    "crew_limit"
  );

  // 3. 最大完了時刻（メイクスパン: max(start + duration)）を最小化
  const makespan = max(tasks.map((t) => expr`${start[t.id]} + ${t.duration}`));
  m.objective(minimize(makespan));

  const status = await m.solve();
  const optMakespan = m.objectiveValue;
  const report = m.verify();
  console.log(`Status: ${status} (valid: ${report.valid}), Minimum Makespan: ${optMakespan}h`);
  for (const t of tasks) {
    const s = start[t.id].value ?? 0;
    console.log(`  ${t.id}: [${s}h, ${s + t.duration}h) crew=${t.crew}${t.usesRig ? " [Rig]" : ""}`);
  }

  // 4. リグ点検 [0, 6)（firmware・calib の開始を 6h 以降に制限）と短納期制約 <= 13h を追加して競合原因を診断
  m.constraint(
    and(expr`${start.firmware} >= 6`, expr`${start.calib} >= 6`),
    "rig_maintenance_window"
  );
  m.constraint(expr`${makespan} <= 13`, "rush_ship_deadline");

  const diag = await m.check();
  console.log(`Deadline Check: ${diag.status}`);
  console.log(`Unsat Core: ${(diag.unsatCore ?? []).join(", ")}`);
}

runProjectScheduling();
```

</CodeRunner>

## 実務上のポイント

### グローバル制約によるコンパクトな記述

制約プログラミングでは、複数の変数にまたがる典型ルールを**グローバル制約**として直接表現できます。ここでは `disjoint()` が共有リグの使用時間の重複を防ぎ、`cumulative()` が同時稼働人数を 3 名以下に制限します。開始時刻を有界な整数変数で表すため、時刻ごとの 0-1 変数を使う定式化と異なり、計画期間を広げたり時間刻みを細かくしたりしても変数数が増えません。

### `m.check()` の前に `m.objectiveValue` を退避する

同じ `Model` に対して `await m.check()` を実行すると、直前の `solve()` の結果がクリアされ、`m.objectiveValue` は `null` になります。最適化で得た値は、`m.check()` を呼ぶ前にローカル変数へ保存しておいてください。

### 納期 `<= 13h` の制約で実行不能になる理由（`unsatCore`）

リグ点検と `<= 13h` の納期制約を追加すると、`m.check()` は `"Unsat"` を返し、無関係な `crew_limit` を除いた矛盾原因（`unsatCore`）を抽出します。

1. `rig_maintenance_window` により、`firmware` と `calib` の開始は `6h` 以降になります。
2. `chassis` は `4h`、`assembly` は `3h` かかるため、`assembly_after_chassis` と `test_after_assembly` により `test` の開始は `7h` 以降になります。
3. 共有リグを使う 3 工程（`firmware` 4h、`calib` 3h、`test` 2h）はいずれも `6h` より前には始められず、`single_rig` により合計 `9h` 分の作業を重複なく実行する必要があります。
4. そのため早くとも時刻 `6 + 9 = 15h` まで完了せず、`rush_ship_deadline`（`<= 13h`）と矛盾します。
