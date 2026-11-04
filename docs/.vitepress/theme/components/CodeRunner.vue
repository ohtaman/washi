<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import { transpileSnippetToJs } from "../utils/transpile";
import { useComponentTranslations } from "../locales/index";

const props = defineProps<{
  preset?: string;
  autorun?: boolean;
}>();

const { lang } = useData();
const i18n = computed(() => useComponentTranslations(lang.value).dict.codeRunner);

const slotEl = ref<HTMLElement | null>(null);
const isRunning = ref(false);
const hasRun = ref(false);
const runTimeMs = ref(0);
const logs = ref<string[]>([]);
const errorMsg = ref<string | null>(null);

async function runSlotCode() {
  if (typeof window === "undefined" || !slotEl.value) return;
  const codeNode = slotEl.value.querySelector("pre code");
  const rawCode = codeNode?.textContent ?? "";
  if (!rawCode.trim()) return;

  isRunning.value = true;
  errorMsg.value = null;
  const capturedLogs: string[] = [];

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  const formatArg = (a: unknown): string => {
    if (typeof a === "string") return a;
    if (typeof a === "object" && a !== null) {
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }
    return String(a);
  };

  console.log = (...args: unknown[]) => {
    capturedLogs.push(args.map(formatArg).join(" "));
    origLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    capturedLogs.push("[WARN] " + args.map(formatArg).join(" "));
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    capturedLogs.push("[ERROR] " + args.map(formatArg).join(" "));
    origError(...args);
  };

  try {
    if (hasRun.value) {
      logs.value = [];
      await new Promise((r) => setTimeout(r, 120));
    }

    const Modeler = await import("../../../../src/index.ts");
    if (rawCode.includes("z3")) {
      const z3Mod = await import("../../../../src/modeler/solvers/z3/index.ts");
      z3Mod.setZ3Assets({
        jsUrl: new URL("/washi/z3-built.js", window.location.origin).href,
        wasmUrl: new URL("/washi/z3-built.wasm", window.location.origin).href,
      });
    }
    if (rawCode.includes("glpk")) {
      await import("../../../../src/modeler/solvers/glpk/index.ts");
    }

    const pendingPromises: Promise<unknown>[] = [];

    class TrackedModel extends Modeler.Model {
      override solve(...args: Parameters<Modeler.Model["solve"]>) {
        const p = super.solve(...args);
        pendingPromises.push(p);
        return p;
      }
      override check(...args: Parameters<Modeler.Model["check"]>) {
        const p = super.check(...args);
        pendingPromises.push(p);
        return p;
      }
    }

    const context: Record<string, unknown> = {
      ...Modeler,
      Model: TrackedModel,
      console: {
        log: console.log,
        warn: console.warn,
        error: console.error,
      },
    };

    const jsCode = transpileSnippetToJs(rawCode);
    const keys = Object.keys(context);
    const values = Object.values(context);

    const t0 = performance.now();
    const fn = new Function(
      ...keys,
      `return (async () => {\n${jsCode}\n})();`
    );
    await fn(...values);
    if (pendingPromises.length > 0) {
      await Promise.allSettled(pendingPromises);
    }
    runTimeMs.value = performance.now() - t0;
    logs.value = capturedLogs;
    hasRun.value = true;
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
    logs.value = capturedLogs;
    hasRun.value = true;
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    isRunning.value = false;
  }
}

onMounted(() => {
  if (props.autorun === true) {
    runSlotCode();
  }
});
</script>

<template>
  <div class="washi-code-runner">
    <div ref="slotEl" class="runner-code-slot">
      <slot />
    </div>

    <div class="runner-action-bar">
      <button
        class="washi-solve-btn"
        :class="{ solving: isRunning }"
        :disabled="isRunning"
        @click="runSlotCode"
      >
        <span v-if="isRunning">⏳ {{ i18n.running }}</span>
        <span v-else>▶ {{ i18n.run }}</span>
      </button>

      <span v-if="hasRun && !isRunning && !errorMsg" class="runner-status-meta">
        ✓ {{ i18n.executed }} ({{ runTimeMs.toFixed(1) }} ms)
      </span>

      <a
        v-if="preset"
        :href="`/washi/demo/?preset=${preset}`"
        target="_self"
        class="playground-link"
        style="margin-left: auto;"
      >
        {{ i18n.openPlayground }}
      </a>
    </div>

    <div v-if="hasRun || isRunning" class="runner-output-panel" :class="{ 'is-stale': isRunning }">
      <div class="console-header">
        <span>{{ i18n.output }}</span>
      </div>
      <pre v-if="errorMsg" class="console-pre error-text"><code>Error: {{ errorMsg }}</code></pre>
      <pre v-else class="console-pre"><code>{{ logs.length > 0 ? logs.join("\n") : (isRunning ? "..." : "(no output)") }}</code></pre>
    </div>
  </div>
</template>
