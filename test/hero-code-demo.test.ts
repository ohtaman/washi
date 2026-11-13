import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import * as Vue from "vue";
import {
  createRenderer,
  defineComponent,
  h,
  nextTick,
  ref,
  type Component,
  type VNode,
} from "vue";
import { compileScript, compileTemplate, parse } from "@vue/compiler-sfc";
import { Model } from "../src/index.js";
import * as HeroExamples from "../docs/.vitepress/theme/components/heroExamples.js";
import heroExamplesLoader, {
  type HeroHighlightedByLocale,
} from "../docs/.vitepress/theme/components/heroExamples.data.js";
import * as RunSnippetModule from "../docs/.vitepress/theme/utils/runSnippet.js";
import type { SnippetRunResult } from "../docs/.vitepress/theme/utils/runSnippet.js";
import * as LocalesModule from "../docs/.vitepress/theme/locales/index.js";
import { EXAMPLES } from "../examples/web-demo/src/presets/index.js";

const {
  HERO_INITIAL_LOGS,
  HERO_PRESET_ID,
  buildHeroSnippetCode,
  resolveHeroLocale,
} = HeroExamples;
const { runWashiSnippet } = RunSnippetModule;
const { useComponentTranslations } = LocalesModule;

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

  constructor(tag: string) {
    this.tag = tag;
  }

  get className(): string {
    return typeof this.props.class === "string" ? this.props.class : "";
  }

  hasClass(cls: string): boolean {
    return this.className.split(/\s+/).includes(cls);
  }

  get textContent(): string {
    return this.children
      .map((child) => (child instanceof TestElement ? child.textContent : child.kind === "text" ? child.text : ""))
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

  findByTag(tag: string): TestElement | null {
    return this.findAll((el) => el.tag === tag)[0] ?? null;
  }

  findByRole(role: string): TestElement | null {
    return this.findAll((el) => el.props.role === role)[0] ?? null;
  }

  querySelector(selector: string): TestElement | null {
    const tags = selector.trim().split(/\s+/).filter(Boolean);
    if (tags.length === 0) return null;

    const matchChain = (root: TestElement, index: number): TestElement | null => {
      const candidates = root.findAll((el) => el.tag === tags[index]);
      if (index === tags.length - 1) {
        return candidates[0] ?? null;
      }
      for (const candidate of candidates) {
        const found = matchChain(candidate, index + 1);
        if (found) return found;
      }
      return null;
    };

    return matchChain(this, 0);
  }

  async trigger(eventName: string): Promise<void> {
    const handler = this.listeners[eventName];
    if (!handler) {
      throw new Error(`No ${eventName} listener bound on <${this.tag} class="${this.className}">`);
    }
    await handler();
    await nextTick();
  }
}

function isEventListener(value: unknown): value is (event?: unknown) => unknown {
  return typeof value === "function";
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
        if (isEventListener(nextValue)) {
          el.listeners[eventName] = nextValue;
        } else {
          delete el.listeners[eventName];
        }
        return;
      }
      if (key === "innerHTML") {
        el.innerHTML = typeof nextValue === "string" ? nextValue : "";
        return;
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
  const withoutTypeOnly = jsCode.replace(/^\s*import\s+type\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
  const withModuleLookups = withoutTypeOnly.replace(
    /^\s*import\s+\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];?\s*$/gm,
    (_full, rawSpecifiers: string, moduleId: string) => {
      const destructured = rawSpecifiers
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const aliasMatch = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
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

  if (descriptor.script || descriptor.scriptSetup) {
    const compiled = compileScript(descriptor, {
      id: relPath,
      inlineTemplate: true,
      templateOptions: {
        compilerOptions: { hoistStatic: false },
      },
    });
    const js = stripTypeScriptTypes(compiled.content);
    const body = rewriteEsmImportsForEval(js);
    const evaluated: Component = new Function("__modules", body)(moduleMap);
    return evaluated;
  }

  if (!descriptor.template) {
    throw new Error(`No <script> or <template> found in ${relPath}`);
  }
  const tpl = compileTemplate({
    source: descriptor.template.content,
    filename: absPath,
    id: relPath,
    compilerOptions: { hoistStatic: false },
  });
  const body = rewriteEsmImportsForEval(tpl.code).replace(
    /\bexport\s+function\s+render\b/,
    "function render"
  );
  const renderFn: () => VNode = new Function("__modules", `${body}\nreturn render;`)(moduleMap);
  return defineComponent({ name: path.basename(relPath, ".vue"), render: renderFn });
}

function mountComponent(
  component: Component,
  props?: Record<string, unknown>,
  slots?: Record<string, () => VNode[]>
) {
  const renderer = createTestRenderer();
  const root = new TestElement("root");
  renderer.render(h(component, props ?? null, slots), root);
  return {
    root,
    unmount() {
      renderer.render(null, root);
    },
  };
}

function createDeferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Home Hero Clean Code Demo, Brand Lockup & Visual Showcase", () => {
  it("resolves EN, JA, and ZH locales cleanly from VitePress lang tags", () => {
    expect(resolveHeroLocale("en-US")).toBe("en");
    expect(resolveHeroLocale("ja-JP")).toBe("ja");
    expect(resolveHeroLocale("zh-CN")).toBe("zh");
    expect(resolveHeroLocale("fr")).toBe("en");
  });

  it("independently verifies CloudSizing MIP optimality and matches EN/JA/ZH live HiGHS execution", async () => {
    // Independent exhaustive check over integer lattice:
    // min 20*small + 50*large s.t. 4*small + 12*large >= 30, 8*small + 32*large >= 80, small,large in Z>=0
    let bestCost = Number.POSITIVE_INFINITY;
    const optimalPairs: Array<{ small: number; large: number }> = [];
    for (let s = 0; s <= 10; s++) {
      for (let l = 0; l <= 5; l++) {
        if (4 * s + 12 * l >= 30 && 8 * s + 32 * l >= 80) {
          const cost = 20 * s + 50 * l;
          if (cost < bestCost) {
            bestCost = cost;
            optimalPairs.length = 0;
            optimalPairs.push({ small: s, large: l });
          } else if (cost === bestCost) {
            optimalPairs.push({ small: s, large: l });
          }
        }
      }
    }
    expect(bestCost).toBe(140);
    expect(optimalPairs).toEqual([{ small: 2, large: 2 }]);

    for (const locale of ["en", "ja", "zh"] as const) {
      const code = buildHeroSnippetCode(locale);
      const res = await runWashiSnippet(code);
      expect(res.errorMsg).toBeNull();
      expect(res.logs).toEqual([`Optimal: $${bestCost}/h`, JSON.stringify(optimalPairs[0])]);
      expect(res.logs).toEqual([...HERO_INITIAL_LOGS]);
    }
  });

  it("links Open in Playground to a matching cloud_sizing preset with identical optimal solution", async () => {
    const preset = EXAMPLES.find((p) => p.id === HERO_PRESET_ID);
    expect(preset).toBeDefined();
    const res = await runWashiSnippet(preset!.code);
    expect(res.errorMsg).toBeNull();
    expect(res.logs).toEqual([...HERO_INITIAL_LOGS]);
  });

  it("captures snippet logs lexically without mutating global console and surfaces runtime errors cleanly", async () => {
    const originalLog = console.log;
    const errRes = await runWashiSnippet(`
      console.log("before failure");
      throw new Error("boom");
    `);
    expect(console.log).toBe(originalLog);
    expect(errRes.logs).toEqual(["before failure"]);
    expect(errRes.errorMsg).toBe("boom");
  });

  it("pre-renders Shiki syntax-highlighted <pre> blocks at build time via heroExamples.data loader", async () => {
    const highlighted = await heroExamplesLoader.load([]);
    for (const locale of ["en", "ja", "zh"] as const) {
      expect(highlighted[locale]).toMatch(/^<pre\b[^>]*\bvp-code\b[^>]*>/);
      expect(highlighted[locale]).toContain("CloudSizing");
      expect(highlighted[locale]).not.toContain('tabindex="0"');
      expect(highlighted[locale]).not.toContain("v-pre");
    }
    expect(highlighted.en).toContain("4 vCPU, 8 GB");
    expect(highlighted.ja).toContain("4vCPU, 8GB");
    expect(highlighted.zh).toContain(buildHeroSnippetCode("zh").split("\n")[2].slice(3));
  });

  it("mounts HeroBrandLogo.vue with accessible SVG role, aria-label, and title", () => {
    const HeroBrandLogo = compileVueSfc(
      "docs/.vitepress/theme/components/HeroBrandLogo.vue",
      { vue: Vue }
    );
    const { root, unmount } = mountComponent(HeroBrandLogo);
    try {
      const svg = root.findByTag("svg");
      expect(svg).not.toBeNull();
      expect(svg!.props.role).toBe("img");
      expect(svg!.props["aria-label"]).toBe("WaSHI");
      expect(root.findByTag("title")?.textContent).toBe("WaSHI");
    } finally {
      unmount();
    }
  });

  it("defers HeroCodeDemo.vue execution until Run click and transitions cleanly across running, live output, locale switch, and error/retry states", async () => {
    vi.stubGlobal("window", { location: { origin: "https://ohtaman.github.io" } });

    const lang = ref("en-US");
    const mockHighlighted: HeroHighlightedByLocale = {
      en: '<pre class="vp-code"><code>// EN CloudSizing</code></pre>',
      ja: '<pre class="vp-code"><code>// JA CloudSizing</code></pre>',
      zh: '<pre class="vp-code"><code>// ZH CloudSizing</code></pre>',
    };
    const runSnippetMock = vi.fn<(rawCode: string) => Promise<SnippetRunResult>>();

    const HeroCodeDemo = compileVueSfc(
      "docs/.vitepress/theme/components/HeroCodeDemo.vue",
      {
        vue: Vue,
        vitepress: { useData: () => ({ lang }) },
        "./heroExamples": HeroExamples,
        "./heroExamples.data": { data: mockHighlighted },
        "../utils/runSnippet": { runWashiSnippet: runSnippetMock },
        "../locales/index": LocalesModule,
      }
    );

    const { root, unmount } = mountComponent(HeroCodeDemo);
    try {
      // 1. Initial mount: zero solver/runner calls, static preview shown, no range sliders
      expect(runSnippetMock).not.toHaveBeenCalled();
      expect(root.findAll((el) => el.tag === "input")).toHaveLength(0);
      expect(root.findByClass("hero-demo-code-inner")?.innerHTML).toBe(mockHighlighted.en);
      expect(root.findByClass("hero-idle-note")?.textContent).toBe("Loads WebAssembly on click");
      expect(root.findByRole("status")).toBeNull();
      expect(root.findByRole("alert")).toBeNull();

      const tag = root.findByClass("hero-console-tag")!;
      expect(tag.hasClass("is-live")).toBe(false);
      expect(tag.textContent.trim()).toBe("Preview");
      expect(root.findByClass("hero-console-pre")?.textContent).toBe(HERO_INITIAL_LOGS.join("\n"));

      const playgroundLink = root.findByClass("playground-link")!;
      expect(playgroundLink.props.href).toBe(`/washi/demo/?preset=${HERO_PRESET_ID}`);
      expect(playgroundLink.props.target).toBe("_self");

      // 2. Reactive locale switch (EN -> JA -> ZH -> JA) updates UI without invoking solver
      lang.value = "zh-CN";
      await nextTick();
      expect(root.findByClass("hero-demo-code-inner")?.innerHTML).toBe(mockHighlighted.zh);
      expect(root.findByClass("hero-demo-caption")?.textContent).toBe(
        useComponentTranslations("zh").dict.heroDemo.caption
      );

      lang.value = "ja-JP";
      await nextTick();
      expect(root.findByClass("hero-demo-code-inner")?.innerHTML).toBe(mockHighlighted.ja);
      expect(runSnippetMock).not.toHaveBeenCalled();

      // 3. Click Run: enters in-flight running state and blocks duplicate concurrent clicks
      const deferredRun = createDeferred<SnippetRunResult>();
      runSnippetMock.mockReturnValueOnce(deferredRun.promise);

      const runBtn = root.findByClass("hero-solve-btn")!;
      expect(runBtn.props.disabled).toBe(false);
      expect(runBtn.textContent).toContain(`▶ ${useComponentTranslations("ja").dict.codeRunner.run}`);

      const clickPromise = runBtn.trigger("click");
      await nextTick();

      expect(runSnippetMock).toHaveBeenCalledTimes(1);
      expect(runSnippetMock).toHaveBeenLastCalledWith(buildHeroSnippetCode("ja"));
      expect(runBtn.props.disabled).toBe(true);
      expect(runBtn.hasClass("solving")).toBe(true);
      expect(runBtn.textContent).toContain("⏳");
      expect(root.findByClass("hero-demo-output")?.hasClass("is-stale")).toBe(true);
      expect(root.findByClass("hero-idle-note")).toBeNull();

      // Duplicate click while running must be ignored
      await runBtn.trigger("click");
      expect(runSnippetMock).toHaveBeenCalledTimes(1);

      // Resolve live execution
      deferredRun.resolve({
        logs: ["Optimal: $140/h", '{"small":2,"large":2}'],
        errorMsg: null,
        runTimeMs: 14.26,
      });
      await clickPromise;
      await nextTick();

      expect(runBtn.props.disabled).toBe(false);
      expect(runBtn.hasClass("solving")).toBe(false);
      expect(root.findByClass("hero-demo-output")?.hasClass("is-stale")).toBe(false);

      const statusBadge = root.findByRole("status");
      expect(statusBadge).not.toBeNull();
      expect(statusBadge!.props["aria-live"]).toBe("polite");
      expect(statusBadge!.textContent).toContain("14.3 ms");

      const liveTag = root.findByClass("hero-console-tag")!;
      expect(liveTag.hasClass("is-live")).toBe(true);
      expect(liveTag.textContent.trim()).toBe("HiGHS WASM");
      expect(root.findByClass("hero-console-pre")?.textContent).toBe(
        'Optimal: $140/h\n{"small":2,"large":2}'
      );

      // 4. Error on subsequent run displays role="alert" and drops green is-live badge
      runSnippetMock.mockResolvedValueOnce({
        logs: [],
        errorMsg: "Failed to fetch highs.wasm",
        runTimeMs: 3.2,
      });
      await runBtn.trigger("click");

      const alertPre = root.findByRole("alert");
      expect(alertPre).not.toBeNull();
      expect(alertPre!.textContent).toBe("Error: Failed to fetch highs.wasm");
      expect(root.findByRole("status")).toBeNull();
      expect(root.findByClass("hero-console-tag")?.hasClass("is-live")).toBe(false);

      // 5. Retry recovery clears alert and restores live state
      runSnippetMock.mockResolvedValueOnce({
        logs: ["Optimal: $140/h", '{"small":2,"large":2}'],
        errorMsg: null,
        runTimeMs: 8.4,
      });
      await runBtn.trigger("click");

      expect(root.findByRole("alert")).toBeNull();
      expect(root.findByRole("status")?.textContent).toContain("8.4 ms");
      expect(root.findByClass("hero-console-tag")?.hasClass("is-live")).toBe(true);
    } finally {
      unmount();
    }
  });

  it("executes live HiGHS solver end-to-end when clicking Run in HeroCodeDemo.vue with zero solver calls before click", async () => {
    vi.stubGlobal("window", { location: { origin: "https://ohtaman.github.io" } });
    const solveSpy = vi.spyOn(Model.prototype, "solve");

    const HeroCodeDemo = compileVueSfc(
      "docs/.vitepress/theme/components/HeroCodeDemo.vue",
      {
        vue: Vue,
        vitepress: { useData: () => ({ lang: ref("en-US") }) },
        "./heroExamples": HeroExamples,
        "./heroExamples.data": {
          data: {
            en: '<pre class="vp-code"><code>CloudSizing</code></pre>',
            ja: '<pre class="vp-code"><code>CloudSizing</code></pre>',
            zh: '<pre class="vp-code"><code>CloudSizing</code></pre>',
          },
        },
        "../utils/runSnippet": RunSnippetModule,
        "../locales/index": LocalesModule,
      }
    );

    const { root, unmount } = mountComponent(HeroCodeDemo);
    try {
      expect(solveSpy).not.toHaveBeenCalled();

      await root.findByClass("hero-solve-btn")!.trigger("click");

      expect(solveSpy).toHaveBeenCalledTimes(1);
      expect(root.findByRole("alert")).toBeNull();
      expect(root.findByRole("status")).not.toBeNull();
      expect(root.findByClass("hero-console-tag")?.hasClass("is-live")).toBe(true);
      expect(root.findByClass("hero-console-pre")?.textContent).toBe(HERO_INITIAL_LOGS.join("\n"));
    } finally {
      unmount();
    }
  });

  it("mounts CodeRunner.vue symmetrically: defers execution by default, honors autorun, and renders slot output and errors", async () => {
    vi.stubGlobal("window", { location: { origin: "https://ohtaman.github.io" } });
    const runSnippetMock = vi.fn<(rawCode: string) => Promise<SnippetRunResult>>();

    const CodeRunner = compileVueSfc(
      "docs/.vitepress/theme/components/CodeRunner.vue",
      {
        vue: Vue,
        vitepress: { useData: () => ({ lang: ref("en-US") }) },
        "../utils/runSnippet": { runWashiSnippet: runSnippetMock },
        "../locales/index": LocalesModule,
      }
    );

    const sampleSnippet = 'console.log("hello washi");';
    const slots = {
      default: () => [h("pre", null, [h("code", null, sampleSnippet)])],
    };

    const { root, unmount } = mountComponent(CodeRunner, { preset: "production" }, slots);
    try {
      // Lazy by default: zero calls and output panel hidden before click
      expect(runSnippetMock).not.toHaveBeenCalled();
      expect(root.findByClass("runner-output-panel")).toBeNull();
      expect(root.findByClass("playground-link")?.props.href).toBe("/washi/demo/?preset=production");

      runSnippetMock.mockResolvedValueOnce({
        logs: ["hello washi"],
        errorMsg: null,
        runTimeMs: 5.5,
      });
      await root.findByClass("washi-solve-btn")!.trigger("click");

      expect(runSnippetMock).toHaveBeenCalledTimes(1);
      expect(runSnippetMock).toHaveBeenLastCalledWith(sampleSnippet);
      expect(root.findByClass("runner-output-panel")).not.toBeNull();
      expect(root.findByClass("console-pre")?.textContent).toBe("hello washi");

      // Re-run with runtime error renders .error-text cleanly
      runSnippetMock.mockResolvedValueOnce({
        logs: [],
        errorMsg: "snippet failed",
        runTimeMs: 1.2,
      });
      await root.findByClass("washi-solve-btn")!.trigger("click");
      expect(root.findByClass("error-text")?.textContent).toBe("Error: snippet failed");
    } finally {
      unmount();
    }

    // With autorun: true, onMounted triggers snippet execution automatically
    runSnippetMock.mockResolvedValueOnce({
      logs: ["autorun ok"],
      errorMsg: null,
      runTimeMs: 2.0,
    });
    const autoMounted = mountComponent(CodeRunner, { autorun: true }, slots);
    try {
      await nextTick();
      expect(runSnippetMock).toHaveBeenCalledTimes(3);
    } finally {
      autoMounted.unmount();
    }
  });

  it("renders visual showcase cards below features and replaces static hero emblem across EN/JA/ZH homepages", () => {
    for (const homeFile of ["docs/index.md", "docs/ja/index.md", "docs/zh/index.md"]) {
      const content = fs.readFileSync(path.resolve(process.cwd(), homeFile), "utf-8");
      expect(content).not.toContain("washi-logo.svg");
      expect(content).not.toContain("brand-hi");
      expect(content).toContain("washi-home-showcase");
      expect(content).not.toContain("/showcase/thumb-ai-shift.png");
      expect(content).toContain("/showcase/thumb-ai-timetable.png");
      expect(content).toContain("/showcase/thumb-titan-pack.png");
      expect(content).toContain("/showcase/thumb-mofumofu-sheep.png");
    }
  });
});
