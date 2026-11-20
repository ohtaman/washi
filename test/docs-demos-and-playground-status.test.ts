import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import * as Vue from "vue";
import {
  createRenderer,
  h,
  nextTick,
  ref,
  type Component,
} from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import * as Washi from "../src/index.js";
import * as LocalesModule from "../docs/.vitepress/theme/locales/index.js";
import * as Z3Module from "../src/modeler/solvers/z3/index.js";

interface TestNode {
  kind: "element" | "text" | "comment";
  parent: TestElement | null;
  text: string;
}

class TestElement implements TestNode {
  readonly kind = "element" as const;
  parent: TestElement | null = null;
  text = "";
  readonly tag: string;
  readonly props: Record<string, unknown> = {};
  readonly listeners: Record<string, (event?: unknown) => unknown> = {};
  readonly children: TestNode[] = [];
  innerHTML = "";
  value = "";
  checked = false;
  selectedIndex = 0;

  constructor(tag: string) {
    this.tag = tag;
  }

  get options(): TestElement[] {
    return this.children.filter((c): c is TestElement => c instanceof TestElement && c.tag === "option");
  }

  addEventListener(eventName: string, listener: (event?: unknown) => unknown): void {
    this.listeners[eventName] = listener;
  }

  removeEventListener(eventName: string): void {
    delete this.listeners[eventName];
  }

  get className(): string {
    return typeof this.props.class === "string" ? this.props.class : "";
  }

  hasClass(cls: string): boolean {
    return this.className.split(/\s+/).includes(cls);
  }

  get textContent(): string {
    return this.children
      .map((child) =>
        child instanceof TestElement
          ? child.textContent
          : child.kind === "text"
            ? child.text
            : ""
      )
      .join("");
  }

  findAll(predicate: (el: TestElement) => boolean): TestElement[] {
    const matches: TestElement[] = [];
    const visit = (node: TestElement) => {
      if (predicate(node)) matches.push(node);
      for (const child of node.children) {
        if (child instanceof TestElement) visit(child);
      }
    };
    for (const child of this.children) {
      if (child instanceof TestElement) visit(child);
    }
    return matches;
  }

  findByClass(cls: string): TestElement | null {
    return this.findAll((el) => el.hasClass(cls))[0] ?? null;
  }

  findAllByClass(cls: string): TestElement[] {
    return this.findAll((el) => el.hasClass(cls));
  }

  findByRole(role: string): TestElement | null {
    return this.findAll((el) => el.props.role === role)[0] ?? null;
  }

  async trigger(eventName: string, eventArg?: unknown): Promise<void> {
    const handler = this.listeners[eventName];
    if (!handler) {
      throw new Error(
        `No ${eventName} listener bound on <${this.tag} class="${this.className}">`
      );
    }
    await handler(eventArg);
    await nextTick();
  }
}

function createTestRenderer() {
  return createRenderer<TestNode, TestElement>({
    createElement(type) {
      return new TestElement(type);
    },
    createText(text) {
      return { kind: "text", parent: null, text };
    },
    createComment(text) {
      return { kind: "comment", parent: null, text };
    },
    setText(node, text) {
      node.text = text;
    },
    setElementText(el, text) {
      el.children.length = 0;
      if (text) {
        el.children.push({ kind: "text", parent: el, text });
      }
    },
    insert(child, parent, anchor) {
      if (child.parent) {
        const prevIdx = child.parent.children.indexOf(child);
        if (prevIdx >= 0) child.parent.children.splice(prevIdx, 1);
      }
      child.parent = parent;
      const anchorIdx = anchor ? parent.children.indexOf(anchor) : -1;
      if (anchorIdx >= 0) {
        parent.children.splice(anchorIdx, 0, child);
      } else {
        parent.children.push(child);
      }
    },
    remove(child) {
      if (!child.parent) return;
      const idx = child.parent.children.indexOf(child);
      if (idx >= 0) child.parent.children.splice(idx, 1);
      child.parent = null;
    },
    parentNode(node) {
      return node.parent;
    },
    nextSibling(node) {
      if (!node.parent) return null;
      const idx = node.parent.children.indexOf(node);
      return idx >= 0 ? (node.parent.children[idx + 1] ?? null) : null;
    },
    patchProp(el, key, _prevValue, nextValue) {
      if (key.startsWith("on") && key.length > 2) {
        const eventName = key.slice(2).toLowerCase();
        if (typeof nextValue === "function") {
          el.listeners[eventName] = nextValue as (event?: unknown) => unknown;
        } else {
          delete el.listeners[eventName];
        }
        return;
      }
      if (key === "innerHTML") {
        el.innerHTML = typeof nextValue === "string" ? nextValue : "";
        return;
      }
      if (key === "value") {
        el.value = nextValue === null || nextValue === undefined ? "" : String(nextValue);
      }
      if (key === "checked") {
        el.checked = Boolean(nextValue);
      }
      if (nextValue === null || nextValue === undefined) {
        delete el.props[key];
      } else {
        el.props[key] = nextValue;
      }
    },
  });
}

function rewriteEsmImportsForEval(jsCode: string): string {
  const withoutTypeOnly = jsCode.replace(
    /^\s*import\s+type\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm,
    ""
  );
  const withModuleLookups = withoutTypeOnly.replace(
    /^\s*import\s+\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];?\s*$/gm,
    (_full, rawSpecifiers: string, moduleId: string) => {
      const destructured = rawSpecifiers
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const aliasMatch = part.match(
            /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/
          );
          return aliasMatch ? `${aliasMatch[1]}: ${aliasMatch[2]}` : part;
        })
        .join(", ");
      return `const { ${destructured} } = __modules[${JSON.stringify(moduleId)}];`;
    }
  );
  return withModuleLookups.replace(/\bexport\s+default\b/, "return");
}

function compileVueSfc(
  relPath: string,
  moduleMap: Record<string, Record<string, unknown>>
): Component {
  const absPath = path.resolve(process.cwd(), relPath);
  const rawSfc = fs.readFileSync(absPath, "utf-8");
  const { descriptor, errors } = parse(rawSfc, { filename: absPath });
  if (errors.length > 0) {
    throw errors[0];
  }
  const compiled = compileScript(descriptor, {
    id: relPath,
    inlineTemplate: true,
    templateOptions: {
      compilerOptions: { hoistStatic: false },
    },
  });
  const js = stripTypeScriptTypes(compiled.content);
  const body = rewriteEsmImportsForEval(js);
  return new Function("__modules", body)(moduleMap) as Component;
}

function mountComponent(component: Component) {
  const renderer = createTestRenderer();
  const root = new TestElement("root");
  renderer.render(h(component), root);
  return {
    root,
    unmount() {
      renderer.render(null, root);
    },
  };
}

async function waitForSolveIdle(root: TestElement, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  await nextTick();
  while (Date.now() < deadline) {
    const btn = root.findByClass("washi-solve-btn");
    if (btn && !btn.hasClass("solving") && !btn.props.disabled) {
      await nextTick();
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
    await nextTick();
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for demo solve to complete`);
}

function createFakeDomForPlayground() {
  const elements = new Map<string, any>();

  const makeEl = (id: string, tagName = "div") => {
    const listeners = new Map<string, Array<(e?: any) => void>>();
    const classSet = new Set<string>();
    const attrs = new Map<string, string>();
    const el: any = {
      id,
      tagName,
      value: "",
      textContent: "",
      innerHTML: "",
      disabled: false,
      checked: false,
      style: {},
      children: [] as any[],
      options: [] as any[],
      className: "",
      classList: {
        add(c: string) {
          classSet.add(c);
          el.className = [...classSet].join(" ");
        },
        remove(c: string) {
          classSet.delete(c);
          el.className = [...classSet].join(" ");
        },
        toggle(c: string, force?: boolean) {
          if (force === undefined) {
            if (classSet.has(c)) classSet.delete(c);
            else classSet.add(c);
          } else if (force) {
            classSet.add(c);
          } else {
            classSet.delete(c);
          }
          el.className = [...classSet].join(" ");
        },
        contains(c: string) {
          return classSet.has(c);
        },
      },
      setAttribute(k: string, v: string) {
        attrs.set(k, v);
      },
      getAttribute(k: string) {
        return attrs.get(k) ?? null;
      },
      removeAttribute(k: string) {
        attrs.delete(k);
      },
      appendChild(child: any) {
        el.children.push(child);
        if (child.tagName === "option") el.options.push(child);
        return child;
      },
      addEventListener(type: string, cb: (e?: any) => void) {
        const arr = listeners.get(type) ?? [];
        arr.push(cb);
        listeners.set(type, arr);
      },
      async trigger(type: string, ev?: any) {
        const arr = listeners.get(type) ?? [];
        for (const cb of arr) {
          await cb(ev);
        }
      },
    };
    Object.defineProperty(el, "innerHTML", {
      get() {
        return el._innerHTML ?? "";
      },
      set(val: string) {
        el._innerHTML = val;
        if (val === "") {
          el.children = [];
          el.options = [];
        }
      },
    });
    return el;
  };

  const ids = [
    "code-editor",
    "line-numbers",
    "preset-select",
    "run-btn",
    "gen-lp-btn",
    "reset-btn",
    "lang-btn-en",
    "lang-btn-ja",
    "lang-btn-zh",
    "metric-status",
    "metric-obj",
    "metric-time",
    "metric-vars",
    "vars-tbody",
    "visualizer-container",
    "lp-output",
    "log-output",
    "docs-content",
    "filter-non-zero",
    "unsat-core-box",
    "unsat-core-title",
    "unsat-core-desc",
    "unsat-core-list",
    "solver-select",
    "solver-badge-text",
    "nav-back-docs",
    "nav-showcase",
    "nav-brand-logo",
  ];
  for (const id of ids) {
    elements.set(id, makeEl(id));
  }

  const tabBtnResults = makeEl("tab-btn-results", "button");
  tabBtnResults.setAttribute("data-tab", "tab-results");
  const tabResults = makeEl("tab-results", "div");
  const tabLogs = makeEl("tab-logs", "div");
  const tabLp = makeEl("tab-lp", "div");
  elements.set("tab-results", tabResults);
  elements.set("tab-logs", tabLogs);
  elements.set("tab-lp", tabLp);

  const mockDoc: any = {
    documentElement: makeEl("html", "html"),
    getElementById(id: string) {
      return elements.get(id) ?? null;
    },
    querySelectorAll(selector: string) {
      if (selector === ".tab-btn") return [tabBtnResults];
      if (selector === ".tab-content") return [tabResults, tabLp, tabLogs];
      return [];
    },
    createElement(tag: string) {
      return makeEl("", tag);
    },
  };

  const storage = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  };

  const mockWindow: any = {
    location: new URL("https://washi.ohtaman.dev/demo/"),
    crossOriginIsolated: false,
    localStorage: mockStorage,
    matchMedia: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
    addEventListener: vi.fn(),
  };

  return { mockDoc, mockWindow, mockStorage, elements };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Z3Module.killZ3Threads();
});

describe("Component Locale Key Parity (docs/.vitepress/theme/locales/components.*.json)", () => {
  it("enforces identical keys and non-empty strings across en, ja, and zh component locales", () => {
    const collectKeys = (obj: unknown, prefix = ""): string[] => {
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        return [prefix];
      }
      const keys: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${k}` : k;
        keys.push(...collectKeys(v, next));
      }
      return keys;
    };

    const enKeys = collectKeys(LocalesModule.en).sort();
    const jaKeys = collectKeys(LocalesModule.ja).sort();
    const zhKeys = collectKeys(LocalesModule.zh).sort();

    expect(jaKeys).toEqual(enKeys);
    expect(zhKeys).toEqual(enKeys);
  });
});

describe("ShiftSchedulingDemo.vue Honest Status & Unsat Core Diagnosis", () => {
  it("removes inferLocalConflict completely from ShiftSchedulingDemo.vue", () => {
    const sfcPath = path.resolve(
      process.cwd(),
      "docs/.vitepress/theme/components/ShiftSchedulingDemo.vue"
    );
    const source = fs.readFileSync(sfcPath, "utf-8");
    expect(source).not.toContain("inferLocalConflict");
    expect(source).not.toContain("max_shifts_limit");
    expect(source).not.toContain("coverage_weekly");
  });

  it("shows honest Cross-Origin Isolation notice and zero fake chips when Infeasible with crossOriginIsolated === false", async () => {
    vi.stubGlobal("window", { crossOriginIsolated: false });

    const getWashiClientMock = vi.fn(async (needZ3 = false) => {
      if (needZ3) {
        throw new Error("Z3 must not be loaded when crossOriginIsolated is false");
      }
      return Washi;
    });

    const lang = ref("en-US");
    const ShiftSchedulingDemo = compileVueSfc(
      "docs/.vitepress/theme/components/ShiftSchedulingDemo.vue",
      {
        vue: Vue,
        vitepress: { useData: () => ({ lang }) },
        "./washiClient": { getWashiClient: getWashiClientMock },
        "../locales/index": LocalesModule,
      }
    );

    const { root, unmount } = mountComponent(ShiftSchedulingDemo);
    try {
      await waitForSolveIdle(root);
      expect(root.findByClass("washi-result-bar")?.hasClass("optimal")).toBe(true);

      // Click the Conflict preset button ("⚠️ Conflict: All Seniors Off on Sat")
      const conflictBtn = root.findAllByClass("washi-chip-btn").find((b) => b.hasClass("danger"));
      expect(conflictBtn).toBeDefined();
      await conflictBtn!.trigger("click");

      // Click Run Optimization
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);

      expect(getWashiClientMock).not.toHaveBeenCalledWith(true);
      expect(root.findAllByClass("unsat-chip")).toHaveLength(0);
      expect(root.findAllByClass("is-conflict")).toHaveLength(0);
      expect(root.findAllByClass("conflict-col-head")).toHaveLength(0);

      const alertBox = root.findByRole("alert");
      expect(alertBox).not.toBeNull();
      expect(alertBox!.textContent).toContain("Cross-Origin Isolation");

      // Locale switch dynamically updates diagnostic notice
      lang.value = "ja-JP";
      await nextTick();
      expect(root.findByRole("alert")!.textContent).toContain("Cross-Origin Isolation");
      lang.value = "zh-CN";
      await nextTick();
      expect(root.findByRole("alert")!.textContent).toContain("crossOriginIsolated");
    } finally {
      unmount();
    }
  });

  it("displays real Z3 unsatCore when Infeasible and crossOriginIsolated === true", async () => {
    vi.stubGlobal("window", { crossOriginIsolated: true });

    const getWashiClientMock = vi.fn(async (needZ3 = false) => {
      if (needZ3) {
        Z3Module.registerZ3Solver();
      }
      return Washi;
    });

    const lang = ref("en-US");
    const ShiftSchedulingDemo = compileVueSfc(
      "docs/.vitepress/theme/components/ShiftSchedulingDemo.vue",
      {
        vue: Vue,
        vitepress: { useData: () => ({ lang }) },
        "./washiClient": { getWashiClient: getWashiClientMock },
        "../locales/index": LocalesModule,
      }
    );

    const { root, unmount } = mountComponent(ShiftSchedulingDemo);
    try {
      await waitForSolveIdle(root);
      const conflictBtn = root.findAllByClass("washi-chip-btn").find((b) => b.hasClass("danger"));
      await conflictBtn!.trigger("click");
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root, 25_000);

      const chips = root.findAllByClass("unsat-chip").map((c) => c.textContent);
      expect(chips.length).toBeGreaterThan(0);
      expect(chips).toContain("senior_Sat");
      expect(chips).toContain("day_off_Alice_Sat");
      expect(chips).toContain("day_off_Bob_Sat");
      expect(chips).toContain("day_off_Claire_Sat");
      expect(chips).not.toContain("max_shifts_limit");
      expect(chips).not.toContain("coverage_weekly");
      expect(root.findAllByClass("is-conflict").length).toBeGreaterThan(0);

      // Recovery: switching back to standard preset makes roster feasible again -> re-solve restores Optimal
      const standardBtn = root.findAllByClass("washi-chip-btn")[0];
      await standardBtn.trigger("click");
      // While dirty, conflict highlights must clear
      expect(root.findAllByClass("is-conflict")).toHaveLength(0);
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);
      expect(root.findByRole("alert")).toBeNull();
      expect(root.findByClass("washi-result-bar")?.hasClass("optimal")).toBe(true);
      expect(root.findAllByClass("unsat-chip")).toHaveLength(0);
    } finally {
      unmount();
    }
  }, 30000);

  it("displays explicit error notice and zero fake chips when Z3 throws or returns empty unsatCore", async () => {
    vi.stubGlobal("window", { crossOriginIsolated: true });

    const solveSpy = vi.spyOn(Washi.Model.prototype, "solve").mockResolvedValue("Infeasible");
    const checkSpy = vi
      .spyOn(Washi.Model.prototype, "check")
      .mockRejectedValueOnce(new Error("Z3 worker crashed"))
      .mockImplementationOnce(async function (this: Washi.Model) {
        this.unsatCore = [];
        return { status: "Unsat", values: {}, unsatCore: [], runTime: 1 };
      });

    const getWashiClientMock = vi.fn(async () => Washi);
    const ShiftSchedulingDemo = compileVueSfc(
      "docs/.vitepress/theme/components/ShiftSchedulingDemo.vue",
      {
        vue: Vue,
        vitepress: { useData: () => ({ lang: ref("en-US") }) },
        "./washiClient": { getWashiClient: getWashiClientMock },
        "../locales/index": LocalesModule,
      }
    );

    const { root, unmount } = mountComponent(ShiftSchedulingDemo);
    try {
      await waitForSolveIdle(root);
      expect(solveSpy).toHaveBeenCalledTimes(1);
      expect(checkSpy).toHaveBeenCalledTimes(1);
      expect(root.findAllByClass("unsat-chip")).toHaveLength(0);
      expect(root.findByRole("alert")!.textContent).toContain("Z3 worker crashed");

      // Re-run where Z3 returns an empty unsatCore
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);
      expect(checkSpy).toHaveBeenCalledTimes(2);
      expect(root.findAllByClass("unsat-chip")).toHaveLength(0);
      expect(root.findByRole("alert")!.textContent).toContain("Unsat Core");
    } finally {
      unmount();
    }
  });

  it("records honest non-Optimal status (TimeLimit / Error / Unknown) instead of forcing Infeasible and clears stale assignments", async () => {
    vi.stubGlobal("window", { crossOriginIsolated: false });

    const solveSpy = vi.spyOn(Washi.Model.prototype, "solve");

    const ShiftSchedulingDemo = compileVueSfc(
      "docs/.vitepress/theme/components/ShiftSchedulingDemo.vue",
      {
        vue: Vue,
        vitepress: { useData: () => ({ lang: ref("en-US") }) },
        "./washiClient": { getWashiClient: async () => Washi },
        "../locales/index": LocalesModule,
      }
    );

    const { root, unmount } = mountComponent(ShiftSchedulingDemo);
    try {
      // Initial mount solves Optimal with On Duty cells and payroll KPI
      await waitForSolveIdle(root);
      expect(root.findAllByClass("on-duty").length).toBeGreaterThan(0);
      expect(root.findByClass("kpi-num")).not.toBeNull();

      // Subsequent TimeLimit clears prior assignments/KPI and records honest status
      solveSpy.mockResolvedValueOnce("TimeLimit");
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);
      expect(root.findAllByClass("on-duty")).toHaveLength(0);
      expect(root.findByClass("kpi-num")).toBeNull();
      const alertTimeLimit = root.findByRole("alert");
      expect(alertTimeLimit).not.toBeNull();
      expect(alertTimeLimit!.textContent).toContain("TimeLimit");
      expect(alertTimeLimit!.textContent).not.toContain("Infeasible");
      expect(root.findAllByClass("unsat-chip")).toHaveLength(0);

      // Subsequent thrown error displays Error and clears stale assignments
      solveSpy.mockRejectedValueOnce(new Error("HiGHS WASM failed"));
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);
      expect(root.findAllByClass("on-duty")).toHaveLength(0);
      const alertError = root.findByRole("alert");
      expect(alertError).not.toBeNull();
      expect(alertError!.textContent).toContain("Error");
      expect(alertError!.textContent).toContain("HiGHS WASM failed");

      // Subsequent Unknown status displays Unknown honestly
      solveSpy.mockResolvedValueOnce("Unknown");
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);
      expect(root.findByRole("alert")!.textContent).toContain("Unknown");
      expect(root.findByRole("alert")!.textContent).not.toContain("Infeasible");
    } finally {
      unmount();
    }
  });
});

describe("PortfolioQpDemo.vue & EcommerceCouponDemo.vue Honest Status & Error Handling", () => {
  it("PortfolioQpDemo clears stale variance/weights and shows honest status/error on non-Optimal or thrown error", async () => {
    vi.stubGlobal("window", {});
    const solveSpy = vi.spyOn(Washi.Model.prototype, "solve");
    const lang = ref("en-US");

    const PortfolioQpDemo = compileVueSfc(
      "docs/.vitepress/theme/components/PortfolioQpDemo.vue",
      {
        vue: Vue,
        vitepress: { useData: () => ({ lang }) },
        "./washiClient": { getWashiClient: async () => Washi },
        "../locales/index": LocalesModule,
      }
    );

    const { root, unmount } = mountComponent(PortfolioQpDemo);
    try {
      await waitForSolveIdle(root);
      expect(root.findByRole("alert")).toBeNull();
      expect(root.findByClass("solve-meta")!.textContent).not.toContain("—");
      expect(root.findAllByClass("qp-pct").some((el) => el.textContent.includes("%"))).toBe(true);

      // Next solve returns Infeasible -> must clear varianceVal & weights and show alert
      solveSpy.mockResolvedValueOnce("Infeasible");
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);

      expect(root.findByClass("solve-meta")!.textContent).toContain("—");
      for (const pctEl of root.findAllByClass("qp-pct")) {
        expect(pctEl.textContent.trim()).toBe("—");
      }
      const alertInfeasible = root.findByRole("alert");
      expect(alertInfeasible).not.toBeNull();
      expect(alertInfeasible!.textContent).toContain("Infeasible");

      // Locale switch updates non-optimal banner text
      lang.value = "ja-JP";
      await nextTick();
      expect(root.findByRole("alert")!.textContent).toContain(
        LocalesModule.ja.portfolioQp.nonOptimalTitle
      );

      // Next solve throws -> must keep variance/weights cleared and display Error message
      solveSpy.mockRejectedValueOnce(new Error("QP backend unavailable"));
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);

      expect(root.findByClass("solve-meta")!.textContent).toContain("—");
      const alertErr = root.findByRole("alert");
      expect(alertErr).not.toBeNull();
      expect(alertErr!.textContent).toContain("Error");
      expect(alertErr!.textContent).toContain("QP backend unavailable");

      // Recovery: next solve succeeds Optimal -> restores weights/variance and clears alert
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);
      expect(root.findByRole("alert")).toBeNull();
      expect(root.findByClass("solve-meta")!.textContent).not.toContain("—");
      expect(root.findAllByClass("qp-pct").some((el) => el.textContent.includes("%"))).toBe(true);
    } finally {
      unmount();
    }
  });

  it("EcommerceCouponDemo surfaces non-Optimal status and errors honestly instead of showing 0 coupons", async () => {
    vi.stubGlobal("window", {});
    const solveSpy = vi.spyOn(Washi.Model.prototype, "solve");
    const lang = ref("en-US");

    const EcommerceCouponDemo = compileVueSfc(
      "docs/.vitepress/theme/components/EcommerceCouponDemo.vue",
      {
        vue: Vue,
        vitepress: { useData: () => ({ lang }) },
        "./washiClient": { getWashiClient: async () => Washi },
        "../locales/index": LocalesModule,
      }
    );

    const { root, unmount } = mountComponent(EcommerceCouponDemo);
    try {
      await waitForSolveIdle(root);
      expect(root.findByRole("alert")).toBeNull();
      expect(root.findByClass("grand-num")!.textContent).toBe("$185");
      expect(
        root.findAllByClass("cpn-status").some((el) => el.textContent.includes("-$"))
      ).toBe(true);

      // Next solve returns TimeLimit -> must NOT display Skipped/0 coupons or $240
      solveSpy.mockResolvedValueOnce("TimeLimit");
      solveSpy.mockResolvedValueOnce("TimeLimit");
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);

      for (const cpnStatus of root.findAllByClass("cpn-status")) {
        expect(cpnStatus.textContent.trim()).toBe("—");
      }
      expect(root.findByClass("grand-num")!.textContent.trim()).toBe("—");
      expect(root.findByClass("smart-filler-banner")).toBeNull();
      const alertTimeLimit = root.findByRole("alert");
      expect(alertTimeLimit).not.toBeNull();
      expect(alertTimeLimit!.textContent).toContain("TimeLimit");

      lang.value = "zh-CN";
      await nextTick();
      expect(root.findByRole("alert")!.textContent).toContain(
        LocalesModule.zh.ecommerce.nonOptimalTitle
      );

      // Next solve rejects -> must display Error and message
      solveSpy.mockRejectedValueOnce(new Error("Cart MIP failed"));
      solveSpy.mockRejectedValueOnce(new Error("Cart MIP failed"));
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);

      const alertErr = root.findByRole("alert");
      expect(alertErr).not.toBeNull();
      expect(alertErr!.textContent).toContain("Error");
      expect(alertErr!.textContent).toContain("Cart MIP failed");

      // Recovery: next solve succeeds Optimal -> restores $185 and coupons
      await root.findByClass("washi-solve-btn")!.trigger("click");
      await waitForSolveIdle(root);
      expect(root.findByRole("alert")).toBeNull();
      expect(root.findByClass("grand-num")!.textContent).toBe("$185");
    } finally {
      unmount();
    }
  });
});

describe("Playground Status Display (examples/web-demo/src/ui/app.ts)", () => {
  it("displays '--' when no model was created and 'NotSolved' when a model was created without calling solve()/check()", async () => {
    const { mockDoc, mockWindow, mockStorage, elements } = createFakeDomForPlayground();
    vi.stubGlobal("document", mockDoc);
    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("localStorage", mockStorage);
    vi.useFakeTimers();

    const { initApp } = await import("../examples/web-demo/src/ui/app.js");
    initApp();

    try {
      // Case 1: Code creates no Model at all -> status MUST be "--", never "Optimal"
      const editor = elements.get("code-editor");
      const runBtn = elements.get("run-btn");
      const metricStatus = elements.get("metric-status");
      const metricObj = elements.get("metric-obj");
      const metricVars = elements.get("metric-vars");
      const vizContainer = elements.get("visualizer-container");

      editor.value = `console.log("no model here");`;
      await runBtn.trigger("click");

      expect(metricStatus.textContent).toBe("--");
      expect(metricStatus.className).not.toContain("status-optimal");
      expect(metricObj.textContent).toBe("--");
      expect(metricVars.textContent).toBe("--");
      expect(vizContainer.innerHTML).toContain("No primal feasible solution to display.");

      // Case 2: Code creates a Model without calling solve() or check() -> status MUST be "NotSolved"
      editor.value = `const m = new Model("UnsolvedModel"); const x = m.continuous("x", { lb: 0, ub: 5 });`;
      await runBtn.trigger("click");

      expect(metricStatus.textContent).toBe("NotSolved");
      expect(metricStatus.className).not.toContain("status-optimal");
      expect(metricObj.textContent).toBe("--");
      expect(metricVars.textContent).toBe("1");
      expect(vizContainer.innerHTML).toContain("No primal feasible solution to display.");

      // Case 3: Code solves an Optimal model, then subsequent execution throws -> clears stale objective
      editor.value = `
        const m = new Model("Opt");
        const x = m.continuous("x", { lb: 0, ub: 4 });
        m.objective(maximize(x));
        await m.solve();
      `;
      await runBtn.trigger("click");
      expect(metricStatus.textContent).toBe("Optimal");
      expect(metricObj.textContent).toBe("4");

      editor.value = `throw new Error("boom");`;
      await runBtn.trigger("click");
      expect(metricStatus.textContent).toBe("Error");
      expect(metricObj.textContent).toBe("--");
      expect(metricVars.textContent).toBe("--");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
