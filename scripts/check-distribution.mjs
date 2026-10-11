import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createServer } from "node:http";
import { build } from "vite";
import webpack from "webpack";

const fixture = await mkdtemp(path.join(tmpdir(), "washi-distribution-"));
const source = `
  window.runPlan = async (integer = true, useWorker = false) => {
    const m = new Model("Distribution");
    const x = m.addVar({ name: "x", type: integer ? "Integer" : "Continuous", lb: 0 });
    const y = m.addVar({ name: "y", type: integer ? "Integer" : "Continuous", lb: 0 });
    m.maximize(x.mul(30).add(y.mul(50)));
    m.addConstraint(x.add(y.mul(2)).le(40));
    m.addConstraint(x.mul(2).add(y).le(50));
    const status = await m.solve({ useWorker });
    return { status, objective: m.objectiveValue, x: x.value, y: y.value };
  };
`;
const expected = { status: "Optimal", objective: 1100, x: 20, y: 10 };
const check = (value) => assert.deepEqual(JSON.parse(JSON.stringify(value)), expected);
const npm = (args, cwd = fixture) => execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const timeout = (promise) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Solver did not settle within 15s")), 15_000);
  })]).finally(() => clearTimeout(timer));
};

/** Executes emitted JS + real WASM. This is a VM test, not browser/CORS validation. */
async function runtime(root, entry, esm, base = "/factory/") {
  const requests = [];
  const origin = "http://distribution.test";
  const entryUrl = `${origin}${base}${entry}`;
  const resolveFile = (url) => {
    const parsed = new URL(url, entryUrl);
    assert.equal(parsed.origin, origin, `unexpected external request: ${url}`);
    assert(parsed.pathname.startsWith(base));
    return path.join(root, parsed.pathname.slice(base.length));
  };
  async function makeContext(url, isWorker = false, deliver) {
    const context = vm.createContext({
      console, WebAssembly, performance, URL, Blob, TextDecoder, TextEncoder,
      setTimeout, clearTimeout, atob, btoa,
      fetch: async (resource) => {
        const target = new URL(String(resource), url).href;
        requests.push(target);
        if (target.endsWith("/html-instead-of.wasm")) {
          return new Response("<!doctype html><title>SPA fallback</title>", { headers: { "content-type": "text/html" } });
        }
        try {
          const bytes = await readFile(resolveFile(target));
          return new Response(bytes, { headers: { "content-type": target.endsWith(".wasm") ? "application/wasm" : "text/javascript" } });
        } catch (error) {
          if (/unexpected external request/.test(error.message)) throw error;
          return new Response("missing asset", { status: 404 });
        }
      },
    });
    context.self = context;
    context.location = new URL(url);
    if (isWorker) {
      context.WorkerGlobalScope = class {};
      context.importScripts = (...urls) => {
        for (const resource of urls) vm.runInContext(readFileSync(resolveFile(new URL(resource, url).href), "utf8"), context);
      };
      context.postMessage = (data) => deliver({ data });
    } else {
      context.window = context;
      const scripts = [];
      context.document = {
        baseURI: `${origin}${base}index.html`,
        currentScript: { src: url, tagName: "SCRIPT" },
        getElementsByTagName: () => scripts,
        createElement: (tag) => ({
          tagName: tag.toUpperCase(), relList: { supports: () => true },
          setAttribute(name, value) { this[name] = value; },
          getAttribute(name) { return this[name]; },
        }),
        head: { appendChild(element) {
          scripts.push(element);
          readFile(resolveFile(element.src), "utf8").then((code) => {
            vm.runInContext(code, context);
            element.onload?.({ type: "load", target: element });
          }).catch((error) => element.onerror?.({ type: "error", target: element, error }));
        } },
      };
      context.Worker = class {
        constructor(workerUrl) {
          this.ready = makeContext(String(workerUrl), true, (event) => this.onmessage?.(event))
            .then(async (workerContext) => {
              const code = await readFile(resolveFile(workerUrl), "utf8");
              if (/^import\s/m.test(code)) await workerContext.loadModule(String(workerUrl));
              else vm.runInContext(code, workerContext);
              return workerContext;
            });
          this.ready.catch((error) => this.onerror?.({ message: error.message }));
        }
        postMessage(data) {
          this.ready.then((workerContext) => workerContext.onmessage({ data })).catch(() => {});
        }
        terminate() {}
      };
    }
    const modules = new Map();
    async function getModule(moduleUrl) {
      if (!modules.has(moduleUrl)) modules.set(moduleUrl, (async () => {
        const mod = new vm.SourceTextModule(await readFile(resolveFile(moduleUrl), "utf8"), {
          context, identifier: moduleUrl,
          initializeImportMeta(meta) { meta.url = moduleUrl; },
          importModuleDynamically: async (specifier, referrer) => {
            assert(/^(\.|https?:)/.test(specifier), `unresolved import: ${specifier}`);
            const child = await getModule(new URL(specifier, referrer.identifier).href);
            await child.evaluate();
            return child;
          },
        });
        await mod.link((specifier, referrer) => {
          assert(/^(\.|https?:)/.test(specifier), `unresolved import: ${specifier}`);
          return getModule(new URL(specifier, referrer.identifier).href);
        });
        return mod;
      })());
      return modules.get(moduleUrl);
    }
    context.loadModule = async (moduleUrl) => { const mod = await getModule(moduleUrl); await mod.evaluate(); return mod.namespace; };
    return context;
  }
  const context = await makeContext(entryUrl);
  let api;
  if (esm) {
    const namespace = await context.loadModule(entryUrl);
    api = namespace;
    if (namespace.Model) context.Model = namespace.Model;
  } else {
    vm.runInContext(await readFile(resolveFile(entryUrl), "utf8"), context);
    api = context.Washi;
    if (context.Washi) context.Model = context.Washi.Model;
  }
  if (!context.runPlan) vm.runInContext(source, context);
  check(await timeout(context.runPlan(true, false)));
  check(await timeout(context.runPlan(false, false)));
  check(await timeout(context.runPlan(true, true)));
  assert(requests.some((url) => url.endsWith(".wasm")));
  console.log(`PASS emitted runtime: ${base}${entry} (LP / MIP / Worker, local assets only)`);
  if (api?.getHighs) {
    for (const name of ["missing.wasm", "html-instead-of.wasm"]) {
      const failedUrl = `${origin}${base}${name}`;
      await assert.rejects(timeout(api.getHighs({ wasmUrl: failedUrl })), (error) => {
        assert(error.message.includes(failedUrl), error.message);
        assert(error.message.includes("no CDN fallback"), error.message);
        return true;
      });
    }
    // The failed initialization must not poison the default solver cache.
    check(await timeout(context.runPlan(true, false)));
    assert(requests.every((url) => new URL(url).origin === origin));
    console.log(`PASS invalid / missing WASM: ${entry} (URL reported, no CDN, retry succeeds)`);
  }
}

async function testZ3WorkerErrorAndRecovery(browserRoot) {
  const origin = "http://distribution.test";
  const base = "/factory/";
  const entryUrl = `${origin}${base}washi.js`;
  const z3Url = `${origin}${base}solvers/z3.js`;
  const resolveFile = (url) => {
    const parsed = new URL(url, entryUrl);
    assert.equal(parsed.origin, origin, `unexpected external request: ${url}`);
    assert(parsed.pathname.startsWith(base));
    return path.join(browserRoot, parsed.pathname.slice(base.length));
  };
  const makeContext = async (url, isWorker = false, deliver) => {
    const context = vm.createContext({
      console, WebAssembly, performance, URL, Blob, TextDecoder, TextEncoder,
      setTimeout, clearTimeout, atob, btoa, SharedArrayBuffer,
      fetch: async (resource) => {
        const target = new URL(String(resource), url).href;
        try {
          const bytes = await readFile(resolveFile(target));
          return new Response(bytes, { headers: { "content-type": target.endsWith(".wasm") ? "application/wasm" : "text/javascript" } });
        } catch {
          return new Response("missing asset", { status: 404 });
        }
      },
    });
    context.self = context;
    context.location = new URL(url);
    context.crossOriginIsolated = true;
    context.isSecureContext = true;
    if (isWorker) {
      context.WorkerGlobalScope = class {};
      context.importScripts = (...urls) => {
        for (const resource of urls) vm.runInContext(readFileSync(resolveFile(new URL(resource, url).href), "utf8"), context);
      };
      context.postMessage = (data) => deliver({ data });
    } else {
      context.window = context;
      const scripts = [];
      context.document = {
        baseURI: `${origin}${base}index.html`,
        currentScript: { src: url, tagName: "SCRIPT" },
        getElementsByTagName: () => scripts,
        createElement: (tag) => ({
          tagName: tag.toUpperCase(), relList: { supports: () => true },
          setAttribute(name, value) { this[name] = value; },
          getAttribute(name) { return this[name]; },
        }),
        head: { appendChild(element) {
          scripts.push(element);
          readFile(resolveFile(element.src), "utf8").then((code) => {
            vm.runInContext(code, context);
            element.onload?.({ type: "load", target: element });
          }).catch((error) => element.onerror?.({ type: "error", target: element, error }));
        } },
      };
      let shouldFail = true;
      let failMessage = "Worker blocked by CSP (simulated error)";
      let workerCount = 0;
      context.setFailWorker = (fail, msg = "Worker blocked by CSP (simulated error)") => {
        shouldFail = fail;
        failMessage = msg;
      };
      context.getWorkerCount = () => workerCount;
      context.Worker = class {
        constructor(workerUrl) {
          if (shouldFail) {
            setTimeout(() => {
              this.onerror?.({ message: failMessage });
            }, 10);
            return;
          }
          this.ready = makeContext(String(workerUrl), true, (event) => this.onmessage?.(event))
            .then(async (workerContext) => {
              const code = await readFile(resolveFile(workerUrl), "utf8");
              if (/^import\s/m.test(code)) await workerContext.loadModule(String(workerUrl));
              else vm.runInContext(code, workerContext);
              return workerContext;
            });
          this.ready.catch((error) => this.onerror?.({ message: error.message }));
        }
        postMessage(data) {
          this.ready?.then((workerContext) => workerContext.onmessage({ data })).catch(() => {});
        }
        terminate() {}
      };
    }
    const modules = new Map();
    async function getModule(moduleUrl) {
      if (!modules.has(moduleUrl)) modules.set(moduleUrl, (async () => {
        const mod = new vm.SourceTextModule(await readFile(resolveFile(moduleUrl), "utf8"), {
          context, identifier: moduleUrl,
          initializeImportMeta(meta) { meta.url = moduleUrl; },
        });
        await mod.link((specifier, referrer) => {
          return getModule(new URL(specifier, referrer.identifier).href);
        });
        return mod;
      })());
      return modules.get(moduleUrl);
    }
    context.loadModule = async (moduleUrl) => { const mod = await getModule(moduleUrl); await mod.evaluate(); return mod.namespace; };
    return context;
  };

  const context = await makeContext(entryUrl);
  const washiMod = await context.loadModule(entryUrl);
  context.Model = washiMod.Model;
  await context.loadModule(z3Url);

  const runCheck = () => vm.runInContext(`
    (async () => {
      const m = new Model({ solver: 'z3' });
      const a = m.addBoolVar('a');
      m.addConstraint(a);
      return await m.check();
    })()
  `, context);

  await assert.rejects(timeout(runCheck()), (err) => {
    assert(err.message.includes("Worker blocked by CSP"), `Expected worker error but got: ${err.message}`);
    return true;
  });
  console.log("PASS Z3 worker error: internal Worker load error rejects check() promise promptly");
}

try {
  const pack = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", fixture], process.cwd()))[0];
  await writeFile(path.join(fixture, "package.json"), JSON.stringify({ private: true, type: "module" }));
  npm(["install", "--ignore-scripts", "--omit=optional", "--no-audit", "--no-fund", path.join(fixture, pack.filename)]);
  const packageRoot = path.join(fixture, "node_modules/@ohtaman/washi");
  const { Model } = await import(new URL(`file://${packageRoot}/dist/lib/washi.js`));
  const model = new Model("PackedNode");
  const x = model.addVar({ name: "x", lb: 0, ub: 10 });
  model.maximize(x.mul(3));
  assert.equal(await model.solve(), "Optimal");
  assert.equal(model.objectiveValue, 30);
  console.log("PASS npm tarball: Node.js solve without optional peers");

  // Verify unimported solver errors
  await assert.rejects(async () => model.solve({ solver: "glpk" }), (err) => {
    assert(err.message.includes("Please import '@ohtaman/washi/solvers/glpk'"));
    return true;
  });
  await assert.rejects(async () => model.solve({ solver: "z3" }), (err) => {
    assert(err.message.includes("Please import '@ohtaman/washi/solvers/z3'"));
    return true;
  });
  console.log("PASS npm tarball: unimported GLPK and Z3 solvers throw helpful import errors in Node.js");

  // Install optional peers in fixture to test solver plugins in Node.js
  npm(["install", "--ignore-scripts", "glpk.js", "z3-solver"], fixture);

  // Test GLPK plugin in Node.js
  await import(new URL(`file://${packageRoot}/dist/lib/solvers/glpk.js`));
  const glpkModel = new Model("GlpkNode", { solver: "glpk" });
  const gx = glpkModel.addVar({ name: "gx", lb: 0, ub: 10 });
  glpkModel.maximize(gx.mul(5));
  assert.equal(await glpkModel.solve(), "Optimal");
  assert.equal(glpkModel.objectiveValue, 50);
  assert.equal(gx.value, 10);
  console.log("PASS npm tarball: GLPK plugin solves MIP in Node.js");

  // Test Z3 plugin in Node.js
  const { killZ3Threads } = await import(new URL(`file://${packageRoot}/dist/lib/solvers/z3.js`));
  const z3Model = new Model("Z3Node", { solver: "z3" });
  const za = z3Model.addBoolVar("za");
  z3Model.addConstraint(za);
  const z3Res = await z3Model.check();
  assert.equal(z3Res.status, "Sat");
  assert.equal(z3Res.values.za, true);
  await killZ3Threads();
  console.log("PASS npm tarball: Z3 plugin solves SMT check in Node.js");

  await writeFile(path.join(fixture, "index.html"), '<script type="module" src="./main.js"></script>');
  await writeFile(path.join(fixture, "main.js"), `import { Model } from '@ohtaman/washi';\nimport '@ohtaman/washi/solvers/glpk';\nimport '@ohtaman/washi/solvers/z3';\n${source}`);
  const viteRoot = path.join(fixture, "vite-output");
  await build({ root: fixture, configFile: false, base: "./", logLevel: "warn", build: { outDir: viteRoot } });
  const html = await readFile(path.join(viteRoot, "index.html"), "utf8");
  const viteEntry = html.match(/src="\.\/([^"]+)"/)[1];
  await runtime(viteRoot, viteEntry, true);

  const viteFiles = (await readdir(viteRoot, { recursive: true })).map(String);
  assert(viteFiles.some(f => f.includes("z3-built") && f.endsWith(".js")), "Vite output missing z3-built.js");
  assert(viteFiles.some(f => f.includes("z3-built") && f.endsWith(".wasm")), "Vite output missing z3-built.wasm");
  console.log("PASS consumer Vite build: discovers and emits Z3 assets");

  const webpackRoot = path.join(fixture, "webpack-output");
  await new Promise((resolve, reject) => webpack({
    mode: "production", target: "web", context: fixture,
    entry: path.join(fixture, "main.js"),
    output: { path: webpackRoot, filename: "app.js", assetModuleFilename: "[name]-[contenthash][ext]" }, performance: { hints: false },
  }, (error, stats) => {
    if (error || stats.hasErrors()) reject(error ?? new Error(stats.toString({ all: false, errors: true })));
    else resolve();
  }));
  await runtime(webpackRoot, "app.js", false);

  const webpackFiles = (await readdir(webpackRoot, { recursive: true })).map(String);
  assert(webpackFiles.some(f => f.includes("z3-built") && f.endsWith(".js")), "Webpack output missing z3-built.js");
  assert(webpackFiles.some(f => f.includes("z3-built") && f.endsWith(".wasm")), "Webpack output missing z3-built.wasm");
  console.log("PASS consumer Webpack build: discovers and emits Z3 assets");

  await runtime(path.join(packageRoot, "dist/browser"), "washi.js", true);
  await runtime(path.join(packageRoot, "dist/browser"), "washi.min.js", false);
  await runtime(viteRoot, viteEntry, true, "/");
  await runtime(webpackRoot, "app.js", false, "/");
  await runtime(path.join(packageRoot, "dist/browser"), "washi.js", true, "/");
  await runtime(path.join(packageRoot, "dist/browser"), "washi.min.js", false, "/");

  await testZ3WorkerErrorAndRecovery(path.join(packageRoot, "dist/browser"));

  if (process.env.RUN_DISTRIBUTION_BROWSER === "1") {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const servers = [];
    async function serve(root, coopCoep = false) {
      const server = createServer(async (req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        if (coopCoep) {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        }
        const pathname = new URL(req.url, "http://localhost").pathname;
        try {
          const relative = pathname.startsWith("/factory/") ? pathname.slice("/factory/".length) : pathname.slice(1);
          const bytes = await readFile(path.join(root, relative));
          res.setHeader("Content-Type", pathname.endsWith(".wasm") ? "application/wasm" : pathname.endsWith(".html") ? "text/html" : "text/javascript");
          res.end(bytes);
        } catch { res.writeHead(404); res.end("missing asset"); }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      servers.push(server);
      return `http://127.0.0.1:${server.address().port}`;
    }
    try {
      const cdn = await serve(path.join(packageRoot, "dist/browser"));
      const cdnIsolated = await serve(path.join(packageRoot, "dist/browser"), true);
      await mkdir(path.join(fixture, "pages"));
      const cases = [
        ["vite", viteRoot, null], ["webpack", webpackRoot, null],
        ["esm", path.join(fixture, "pages"), `<script type="module">import {Model} from '${cdn}/factory/washi.js';${source}</script>`],
        ["iife", path.join(fixture, "pages"), `<script src="${cdn}/factory/washi.min.js"></script><script>const {Model}=Washi;${source}</script>`],
      ];
      await writeFile(path.join(webpackRoot, "index.html"), '<script src="./app.js"></script>');
      for (const [name, root, content] of cases) {
        if (content) await writeFile(path.join(root, `${name}.html`), content);
        const site = await serve(root);
        for (const base of ["/", "/factory/"]) {
          const context = await browser.newContext();
          const blocked = [];
          await context.route("**/*", (route) => {
            if (new URL(route.request().url()).hostname !== "127.0.0.1") { blocked.push(route.request().url()); return route.abort(); }
            return route.continue();
          });
          const page = await context.newPage();
          await page.goto(`${site}${base}${content ? name + ".html" : "index.html"}`);
          await page.waitForFunction(() => typeof window.runPlan === "function");
          for (const useWorker of [false, true]) check(await timeout(page.evaluate((worker) => window.runPlan(true, worker), useWorker)));
          check(await timeout(page.evaluate(() => window.runPlan(false, false))));
          assert.deepEqual(blocked, []);
          await context.close();
          console.log(`PASS Chromium: ${base}${name} (fresh context, local / cross-origin assets, external network blocked)`);
        }
      }

      // Test GLPK ESM and IIFE in Chromium
      const glpkSource = `
        window.runGlpk = async () => {
          const { Model } = window.Washi || await import('${cdn}/factory/washi.js');
          const m = new Model({ solver: 'glpk' });
          const x = m.addVar({ name: 'x', type: 'Integer', lb: 0 });
          m.maximize(x.mul(10));
          m.addConstraint(x.le(5));
          const status = await m.optimize();
          return { status, x: x.value, objective: m.objectiveValue };
        };
      `;
      const glpkCases = [
        ["glpk-esm", path.join(fixture, "pages"), `<script type="module">import '${cdn}/factory/solvers/glpk.js';${glpkSource}</script>`],
        ["glpk-iife", path.join(fixture, "pages"), `<script src="${cdn}/factory/washi.min.js"></script><script src="${cdn}/factory/solvers/glpk.min.js"></script><script>${glpkSource}</script>`],
      ];
      for (const [name, root, content] of glpkCases) {
        await writeFile(path.join(root, `${name}.html`), content);
        const site = await serve(root);
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`${site}/${name}.html`);
        await page.waitForFunction(() => typeof window.runGlpk === "function");
        const res = await timeout(page.evaluate(() => window.runGlpk()));
        assert.equal(res.status, "Optimal");
        assert.equal(res.objective, 50);
        assert.equal(res.x, 5);
        await context.close();
        console.log(`PASS Chromium: ${name} (GLPK plugin solve)`);
      }

      // Test Z3 browser environment requirement (throws error when crossOriginIsolated is false)
      const z3MissingPage = `<script type="module">
        import { Model } from '${cdn}/factory/washi.js';
        import '${cdn}/factory/solvers/z3.js';
        window.runZ3 = async () => {
          const m = new Model({ solver: 'z3' });
          return await m.check();
        };
      </script>`;
      await writeFile(path.join(fixture, "pages", "z3-missing.html"), z3MissingPage);
      const standardSite = await serve(path.join(fixture, "pages"), false);
      const z3Ctx1 = await browser.newContext();
      const z3Page1 = await z3Ctx1.newPage();
      await z3Page1.goto(`${standardSite}/z3-missing.html`);
      await z3Page1.waitForFunction(() => typeof window.runZ3 === "function");
      const errMessage = await z3Page1.evaluate(async () => {
        try { await window.runZ3(); return null; } catch (e) { return e.message; }
      });
      assert(errMessage && errMessage.includes("SharedArrayBuffer and crossOriginIsolated"), errMessage);
      await z3Ctx1.close();
      console.log("PASS Chromium: Z3 rejects when Cross-Origin-Isolation headers are missing");

      // Test Z3 browser solve with COOP / COEP headers enabled (using default asset URLs)
      const z3IsolatedPage = `<script type="module">
        import { Model } from '${cdnIsolated}/factory/washi.js';
        import '${cdnIsolated}/factory/solvers/z3.js';
        window.runZ3 = async () => {
          const m = new Model({ solver: 'z3' });
          const a = m.addBoolVar('a');
          m.addConstraint(a);
          return await m.check();
        };
      </script>`;
      await writeFile(path.join(fixture, "pages", "z3-isolated.html"), z3IsolatedPage);
      const isolatedSite = await serve(path.join(fixture, "pages"), true);
      const z3Ctx2 = await browser.newContext();
      const z3Page2 = await z3Ctx2.newPage();
      await z3Page2.goto(`${isolatedSite}/z3-isolated.html`);
      await z3Page2.waitForFunction(() => typeof window.runZ3 === "function");
      const z3Res = await timeout(z3Page2.evaluate(() => window.runZ3()), 30_000);
      assert.equal(z3Res.status, "Sat");
      assert.equal(z3Res.values.a, true);
      await z3Ctx2.close();
      console.log("PASS Chromium: Z3 solves SMT check under Cross-Origin-Isolation");

    } finally {
      await browser.close();
      await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    }
  } else console.log("Browser/CORS checks not run; set RUN_DISTRIBUTION_BROWSER=1 with Playwright Chromium installed.");
} finally {
  await rm(fixture, { recursive: true, force: true });
  process.exit(0);
}
