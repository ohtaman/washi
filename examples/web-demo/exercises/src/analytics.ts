import type { Locale, RuntimeId, VerdictStatus } from "./types.js";

export type ExerciseAnalyticsRuntime = "washi" | "pulp";
export type ExerciseAnalyticsTab = ExerciseAnalyticsRuntime | "problem" | "editorial";

export interface ExerciseEventMap {
  exercise_view: {
    problem_id: string;
    exercise_runtime: ExerciseAnalyticsRuntime;
    locale: Locale;
  };
  exercise_tab_switch: {
    problem_id: string;
    tab: ExerciseAnalyticsTab;
    locale: Locale;
  };
  exercise_run: {
    problem_id: string;
    exercise_runtime: ExerciseAnalyticsRuntime;
    verdict: VerdictStatus;
    locale: Locale;
  };
  exercise_solution_reveal: {
    problem_id: string;
    exercise_runtime: ExerciseAnalyticsRuntime;
    locale: Locale;
  };
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function toAnalyticsRuntime(runtime: RuntimeId): ExerciseAnalyticsRuntime {
  return runtime === "washi" ? "washi" : "pulp";
}

/**
 * Privacy-safe analytics helper for Optimization 100 Exercises.
 * Emits only fixed identifiers/enums via GA4 gtag() or GTM dataLayer,
 * and cleanly no-ops when analytics scripts are not injected.
 */
export function trackExerciseEvent<K extends keyof ExerciseEventMap>(
  name: K,
  params: ExerciseEventMap[K]
): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, { ...params });
    } else if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: name, ...params });
    }
  } catch {
    // Telemetry must never interrupt exercise workflows
  }
}
