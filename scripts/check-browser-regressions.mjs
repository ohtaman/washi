import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

async function withDeadline(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Browser regression did not settle within 30s")), 30_000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs against the packed browser distribution, not source imports or mock solvers. */
export async function checkBrowserRegressions({ browser, serve, fixture, browserRoot }) {
  const assets = await serve(browserRoot, true);
  const pagesRoot = path.join(fixture, "pages");
  const site = await serve(pagesRoot, true);

  for (const format of ["esm", "iife"]) {
    for (const solver of ["highs", "glpk", "z3"]) {
      const plugin = solver === "highs" ? "" : solver;
      const setup = format === "esm"
        ? `<script type="module">
            import * as api from '${assets}/factory/washi.js';
            ${plugin ? `import '${assets}/factory/solvers/${plugin}.js';` : ""}
            window.api = api;
          </script>`
        : `<script src="${assets}/factory/washi.min.js"></script>
           ${plugin ? `<script src="${assets}/factory/solvers/${plugin}.min.js"></script>` : ""}
           <script>window.api = Washi;</script>`;
      const file = `regression-${solver}-${format}.html`;
      await writeFile(path.join(pagesRoot, file), setup);
      const context = await browser.newContext({ serviceWorkers: "block" });
      const externalRequests = [];
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (new URL(url).hostname !== "127.0.0.1") {
          externalRequests.push(url);
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // A hung solve must fail this test instead of keeping the CI job alive.
      page.setDefaultTimeout(30_000);
      try {
        await page.goto(`${site}/factory/${file}`);
        await page.waitForFunction(() => Boolean(window.api));
        await withDeadline(page.evaluate(async (solverName) => {
          const { Model, maximize, expr } = window.api;
          const require = (condition, message) => { if (!condition) throw new Error(message); };
          const m = new Model("Browser integration");
          const x = m.integer("x", { lb: 0, ub: 10 });
          const active = m.binary("active");
          m.constraint(active.eq(1), "activation");
          m.indicator(active, x.le(7), { name: "conditional_capacity" });
          m.objective(maximize(expr`3 * ${x} + 5`));
          const progress = [];
          require(await m.optimize({ solver: solverName, useWorker: true,
            onProgress: (event) => progress.push(event) }) === "Optimal", "Expected Optimal");
          require(x.value === 7 && m.objectiveValue === 26, "Wrong primal or objective offset");
          require(m.hasPrimalSolution && m.terminationStatus === "Optimal", "Wrong solution metrics");
          require(progress.length > 0, "No progress callback received");
          const report = m.validateSolution();
          require(report.valid && report.complete && report.violations.length === 0, "Invalid solution");
          const invalid = m.validateSolution({ values: { x: 8, active: 1 } });
          require(!invalid.valid, "Validator accepted an indicator violation");

          let rejected = false;
          try { m.indicator(active, x.le(2), { M: NaN }); } catch { rejected = true; }
          require(rejected && m.objectiveValue === 26 && m.status === "Optimal", "Failed validation changed solved state");
          const controller = new AbortController();
          controller.abort();
          require(await m.optimize({ solver: solverName, signal: controller.signal }) === "Unknown", "Wrong pre-abort status");
          require(m.terminationStatus === "Interrupted" && !m.hasPrimalSolution && x.value === null,
            "Pre-abort left stale primal values");
          require(await m.optimize({ solver: solverName }) === "Optimal" && m.objectiveValue === 26,
            "Could not solve again after cancellation");

          if (solverName === "z3") {
            const logic = new Model("Browser conflicts");
            const a = logic.bool("a");
            logic.constraint(a, "required presence");
            require((await logic.check("z3")).status === "Sat", "Expected Sat");
            require(logic.validateSolution().valid, "Boolean solution validation failed");
            logic.constraint(a.not(), "requested absence");
            require((await logic.check("z3")).status === "Unsat", "Expected Unsat");
            require(logic.unsatCore.length === 2 && logic.unsatCore.includes("required presence") &&
              logic.unsatCore.includes("requested absence"), "Wrong named unsat core");
            require(JSON.stringify(logic.conflicts) === JSON.stringify(logic.unsatCore), "Conflict alias mismatch");
          }
        }, solver));
        if (solver === "highs") await checkWorkerCancellation(page);
        assert.deepEqual(errors, [], `${solver}/${format}: uncaught browser errors`);
        assert.deepEqual(externalRequests, [], `${solver}/${format}: external network dependency`);
        console.log(`PASS Chromium regression: ${solver}/${format} (declarative API, Big-M, validation, metrics, cancellation/recovery${solver === "z3" ? ", SAT/UNSAT/conflicts" : ""})`);
      } finally {
        await context.close();
      }
    }
  }
}

async function checkWorkerCancellation(page) {
  // Use a fresh page so the observed Worker is created inside this test.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.api));
  await withDeadline(page.evaluate(async () => {
    const { Model, sum } = window.api;
    const require = (condition, message) => { if (!condition) throw new Error(message); };
    const NativeWorker = window.Worker;
    const workers = [];
    // Observe actual Worker traffic and termination without replacing solver responses.
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.solves = [];
        this.stopped = false;
        workers.push(this);
      }
      postMessage(message, ...args) {
        if (message.type === "SOLVE") this.solves.push(message.lpString);
        return super.postMessage(message, ...args);
      }
      terminate() { this.stopped = true; return super.terminate(); }
    };
    try {
      const active = new Model("Active worker solve");
      const weights = [13, 17, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
      const x = weights.map((_, i) => active.binary(`item_${i}`));
      active.constraint(sum(x.map((v, i) => v.mul(weights[i]))).le(180));
      active.objective(window.api.maximize(sum(x.map((v, i) => v.mul(weights[i] + 6))).add(100)));
      const queued = new Model("Cancelled queued solve");
      const q = queued.continuous("cancelled_queue_marker", { lb: 0, ub: 3 });
      queued.maximize(q);
      const remaining = new Model("Remaining queued solve");
      const r = remaining.continuous("remaining_queue_marker", { lb: 0, ub: 5 });
      remaining.maximize(r);
      const activeController = new AbortController();
      const queuedController = new AbortController();
      let progressCount = 0;
      const first = active.optimize({ useWorker: true, presolve: "off", signal: activeController.signal,
        onProgress: () => {
          if (progressCount++ > 0) return;
          queuedController.abort();
          require(!workers[0].stopped, "Cancelling a queued solve terminated the active Worker");
          activeController.abort();
        } });
      // All three requests enter the queue before the fresh Worker emits progress.
      const second = queued.optimize({ useWorker: true, signal: queuedController.signal });
      const third = remaining.optimize({ useWorker: true });
      await Promise.all([first, second, third]);
      require(progressCount > 0, "Real Worker did not emit progress");
      require(active.terminationStatus === "Interrupted", "Active solve was not interrupted");
      require(queued.terminationStatus === "Interrupted" && !queued.hasPrimalSolution && q.value === null,
        "Queued cancellation returned stale values");
      require(workers.length === 2 && workers[0].stopped && workers[0].solves.length === 1,
        "Active Worker was not replaced correctly");
      require(workers[1].solves.length === 1 && workers[1].solves[0].includes("remaining_queue_marker"),
        "Cancelled queued solve was dispatched or remaining solve was lost");
      require(remaining.status === "Optimal" && r.value === 5 && remaining.validateSolution().valid,
        "Remaining queued solve failed after Worker replacement");
      require(await queued.optimize({ useWorker: true }) === "Optimal" && q.value === 3,
        "Cancelled model could not be solved again");
      console.log("PASS real HiGHS Worker: active abort, queued abort, replacement, and recovery");
    } finally {
      window.Worker = NativeWorker;
    }
  }));
}
