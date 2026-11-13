export type HeroLocale = "en" | "ja" | "zh";

export const HERO_PRESET_ID = "cloud_sizing";

export const HERO_INITIAL_LOGS: readonly string[] = [
  "Optimal: $140/h",
  '{"small":2,"large":2}',
];

const SPEC_COMMENT: Record<HeroLocale, string> = {
  en: "// small ($20/h: 4 vCPU, 8 GB), large ($50/h: 12 vCPU, 32 GB)",
  ja: "// small ($20/h: 4vCPU, 8GB), large ($50/h: 12vCPU, 32GB)",
  zh: "// small ($20/h: 4核, 8GB), large ($50/h: 12核, 32GB)",
};

export function resolveHeroLocale(lang: string): HeroLocale {
  const normalized = lang.toLowerCase();
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("zh")) return "zh";
  return "en";
}

export function buildHeroSnippetCode(locale: HeroLocale = "en"): string {
  return `import { Model, expr, minimize } from "@ohtaman/washi";

${SPEC_COMMENT[locale]}
const m = new Model("CloudSizing");
const small = m.integer("small", { lb: 0 });
const large = m.integer("large", { lb: 0 });

m.objective(minimize(expr\`20 * \${small} + 50 * \${large}\`));
m.constraint(expr\`4 * \${small} + 12 * \${large} >= 30\`, "vcpu");
m.constraint(expr\`8 * \${small} + 32 * \${large} >= 80\`, "ram_gb");

const status = await m.solve();
console.log(\`\${status}: $\${m.objectiveValue}/h\`);
console.log({ small: small.value, large: large.value });`;
}
