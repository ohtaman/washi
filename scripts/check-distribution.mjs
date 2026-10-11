import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
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

  await writeFile(path.join(fixture, "index.html"), '<script type="module" src="./main.js"></script>');
  await writeFile(path.join(fixture, "main.js"), `import { Model } from '@ohtaman/washi';\n${source}`);
  const viteRoot = path.join(fixture, "vite-output");
  await build({ root: fixture, configFile: false, base: "./", logLevel: "warn", build: { outDir: viteRoot } });
  const html = await readFile(path.join(viteRoot, "index.html"), "utf8");
  const viteEntry = html.match(/src="\.\/([^"]+)"/)[1];
  await runtime(viteRoot, viteEntry, true);

  const webpackRoot = path.join(fixture, "webpack-output");
  await new Promise((resolve, reject) => webpack({
    mode: "production", target: "web", context: fixture,
    entry: path.join(fixture, "main.js"),
    output: { path: webpackRoot, filename: "app.js" }, performance: { hints: false },
  }, (error, stats) => {
    if (error || stats.hasErrors()) reject(error ?? new Error(stats.toString({ all: false, errors: true })));
    else resolve();
  }));
  await runtime(webpackRoot, "app.js", false);
  await runtime(path.join(packageRoot, "dist/browser"), "washi.js", true);
  await runtime(path.join(packageRoot, "dist/browser"), "washi.min.js", false);
  await runtime(viteRoot, viteEntry, true, "/");
  await runtime(webpackRoot, "app.js", false, "/");
  await runtime(path.join(packageRoot, "dist/browser"), "washi.js", true, "/");
  await runtime(path.join(packageRoot, "dist/browser"), "washi.min.js", false, "/");

  if (process.env.RUN_DISTRIBUTION_BROWSER === "1") {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const servers = [];
    async function serve(root) {
      const server = createServer(async (req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
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
    } finally {
      await browser.close();
      await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    }
  } else console.log("Browser/CORS checks not run; set RUN_DISTRIBUTION_BROWSER=1 with Playwright Chromium installed.");
} finally {
  await rm(fixture, { recursive: true, force: true });
}
