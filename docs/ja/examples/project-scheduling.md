# リソース制約付きプロジェクトスケジューリング (CP / Pumpkin)

| 問題クラス | ソルバー | 主な API | リンク |
| :--- | :--- | :--- | :--- |
| CP / LCG (RCPSP・Unsat Core) | Pumpkin (`@ohtaman/washi/solvers/pumpkin`) | `m.integer()`, `disjoint()`, `cumulative()`, `max()`, `and()`, `m.check()` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=project_scheduling">Playground (スケジュール)</a></li><li><a href="https://washi.ohtaman.dev/demo/?preset=project_conflict_unsat">Playground (競合診断)</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/15-project-scheduling-cp.ts">ソースコード</a></li><li><a href="/ja/guide/constraint-programming">CP モデリングガイド</a></li></ul> |

**リソース制約付きプロジェクトスケジューリング問題 (RCPSP)** では、作業間の**先行順序関係**に加えて、**単一専用設備の排他占有（非重複制約）**と**共有人員の上限（累積資源制約）**を同時に満たす最短工期（メイクスパン最小化）を求めます。

同梱の **Pumpkin**（`@ohtaman/washi/solvers/pumpkin`）を使うと、以下の利点があります：
1. 各作業に**開始時刻の有限整数変数 1 本だけ**（`start[task]`）を置くコンパクトな定式化ができ、$O(|T| \cdot H)$ 個の時間離散化バイナリ変数が不要になります。
2. 設備メンテナンスや厳しい納期の追加で実行不能になった場合も、同じモデルに対して **`COOP` / `COEP` ヘッダーなし**で `m.check()` を呼び出し、矛盾原因の制約群（`unsatCore`）を特定できます。

## 問題設定

24 時間の計画ホライズン内に **6 つのハードウェア試作工程** を配置します（技術者総数上限 `crewCapacity = 3` 名、共有 HIL 試験・校正リグ 1 基）：

| 工程 | 所要時間 | 要員数 | 先行工程 | 共有リグ (`disjoint`) |
| :--- | :--- | :--- | :--- | :--- |
| `chassis` | 4h | 2名 | — | なし |
| `board` | 3h | 2名 | — | なし |
| `firmware` | 4h | 1名 | — | **使用** |
| `assembly` | 3h | 2名 | `chassis`, `board` | なし |
| `calib` | 3h | 1名 | `board` | **使用** |
| `test` | 2h | 2名 | `assembly`, `firmware`, `calib` | **使用** |

人員上限を無視した単純クリティカルパス長は `9h`（`chassis 4h -> assembly 3h -> test 2h`）ですが、`crewCapacity = 3` 名のもとでは 2 名要する `{chassis, board, assembly}` を並行実施できないため、真の最小工期は **`12h`** となります。

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

  // 2. 共有試験リグの排他占有（disjoint）と技術者 3 名の累積上限（cumulative）
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

  // 3. 総完了時刻（メイクスパン: max(start + duration)）を最小化
  const makespan = max(tasks.map((t) => expr`${start[t.id]} + ${t.duration}`));
  m.objective(minimize(makespan));

  const status = await m.solve();
  const optMakespan = m.objectiveValue;
  const report = m.validateSolution();
  console.log(`Status: ${status} (valid: ${report.valid}), Minimum Makespan: ${optMakespan}h`);
  for (const t of tasks) {
    const s = start[t.id].value ?? 0;
    console.log(`  ${t.id}: [${s}h, ${s + t.duration}h) crew=${t.crew}${t.usesRig ? " [Rig]" : ""}`);
  }

  // 4. リグ点検 [0, 6) と短納期制約 <= 13h を追加して競合原因を診断
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

- **CP プロパゲータによる自然な記述**: `disjoint`（エッジファインディング）と `cumulative`（タイムテーブル伝播）を整数開始時刻上に直接構築することで、時間軸の粒度に左右されないコンパクトなスケジューリングモデルが得られます。
- **`m.check()` 前の結果保持**: 同一 `Model` で `await m.check()` を実行すると前回の `solve()` 結果（`m.objectiveValue` など）はリセットされるため、最適化結果を変数に退避してから診断を実行します。
- **ブラウザ上でも `COOP`/`COEP` 不要で `unsatCore` を抽出**: 後半の `diag.unsatCore` は無関係な `crew_limit` を除外し、リグ点検（`firmware >= 6`, `calib >= 6`）・`assembly -> test` 連鎖（`test >= 7`）・`single_rig` 合計 9h（終了 $\ge 15 > 13$）・`rush_ship_deadline` の矛盾を的確に抽出します。
