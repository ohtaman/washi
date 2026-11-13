<script setup lang="ts">
import { ref, computed } from "vue";
import { useData } from "vitepress";
import {
  HERO_INITIAL_LOGS,
  HERO_PRESET_ID,
  buildHeroSnippetCode,
  resolveHeroLocale,
} from "./heroExamples";
import { data as highlightedByLocale } from "./heroExamples.data";
import { runWashiSnippet } from "../utils/runSnippet";
import { useComponentTranslations } from "../locales/index";

const { lang } = useData();
const localeKey = computed(() => resolveHeroLocale(lang.value));
const translations = computed(() => useComponentTranslations(lang.value).dict);
const runnerI18n = computed(() => translations.value.codeRunner);
const heroI18n = computed(() => translations.value.heroDemo);

const highlightedHtml = computed(() => highlightedByLocale[localeKey.value]);

const isRunning = ref(false);
const hasRun = ref(false);
const runTimeMs = ref(0);
const logs = ref<string[]>([...HERO_INITIAL_LOGS]);
const errorMsg = ref<string | null>(null);

async function runHeroCode() {
  if (typeof window === "undefined" || isRunning.value) return;

  isRunning.value = true;
  errorMsg.value = null;

  try {
    const rawCode = buildHeroSnippetCode(localeKey.value);
    const res = await runWashiSnippet(rawCode);
    runTimeMs.value = res.runTimeMs;
    errorMsg.value = res.errorMsg;
    if (res.errorMsg === null) {
      logs.value = res.logs;
      hasRun.value = true;
    }
  } finally {
    isRunning.value = false;
  }
}
</script>

<template>
  <div class="washi-hero-demo">
    <div class="hero-demo-header">
      <div class="hero-demo-title-group">
        <span class="hero-demo-filename">cloud-sizing.ts</span>
        <span class="hero-demo-caption">{{ heroI18n.caption }}</span>
      </div>
      <span class="hero-demo-solver-pill">{{ heroI18n.badge }}</span>
    </div>

    <div class="hero-demo-code-inner" v-html="highlightedHtml" />

    <div class="hero-demo-actions">
      <button
        type="button"
        class="washi-solve-btn hero-solve-btn"
        :class="{ solving: isRunning }"
        :disabled="isRunning"
        @click="runHeroCode"
      >
        <span v-if="isRunning">⏳ {{ runnerI18n.running }}</span>
        <span v-else>▶ {{ runnerI18n.run }}</span>
      </button>

      <span
        v-if="hasRun && !isRunning && !errorMsg"
        role="status"
        aria-live="polite"
        class="runner-status-meta"
      >
        ✓ {{ runnerI18n.executed }} ({{ runTimeMs.toFixed(1) }} ms)
      </span>
      <span v-else-if="!isRunning" class="hero-idle-note">
        {{ heroI18n.idleHint }}
      </span>

      <a
        :href="`/washi/demo/?preset=${HERO_PRESET_ID}`"
        target="_self"
        class="playground-link"
      >
        {{ runnerI18n.openPlayground }}
      </a>
    </div>

    <div class="hero-demo-output" :class="{ 'is-stale': isRunning }">
      <div class="hero-console-header">
        <span>{{ runnerI18n.output }}</span>
        <span class="hero-console-tag" :class="{ 'is-live': hasRun && !errorMsg }">
          {{ hasRun && !errorMsg ? heroI18n.liveTag : heroI18n.previewTag }}
        </span>
      </div>
      <pre
        v-if="errorMsg"
        role="alert"
        class="hero-console-pre error-text"
      ><code>Error: {{ errorMsg }}</code></pre>
      <pre v-else class="hero-console-pre"><code>{{ logs.join("\n") }}</code></pre>
    </div>
  </div>
</template>
