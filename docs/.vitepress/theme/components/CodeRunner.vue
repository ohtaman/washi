<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useData } from "vitepress";
import { runWashiSnippet } from "../utils/runSnippet";
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

  try {
    if (hasRun.value) {
      logs.value = [];
      await new Promise((r) => setTimeout(r, 120));
    }

    const res = await runWashiSnippet(rawCode);
    runTimeMs.value = res.runTimeMs;
    logs.value = res.logs;
    errorMsg.value = res.errorMsg;
    hasRun.value = true;
  } finally {
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
        type="button"
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
        :href="`/demo/?preset=${preset}`"
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
