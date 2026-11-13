import { resolve } from "node:path";
import { createMarkdownRenderer, defineLoader } from "vitepress";
import { buildHeroSnippetCode, type HeroLocale } from "./heroExamples";

export type HeroHighlightedByLocale = Record<HeroLocale, string>;

declare const data: HeroHighlightedByLocale;
export { data };

function extractShikiPreBlock(renderedHtml: string): string {
  const preMatch = renderedHtml.match(/<pre\b[\s\S]*?<\/pre>/);
  if (!preMatch) {
    throw new Error("Failed to extract <pre> block from Shiki output for Hero demo.");
  }
  return preMatch[0]
    .replace(/\s+tabindex="0"/g, "")
    .replace(/\s+v-pre(?:="")?/g, "");
}

export default defineLoader({
  watch: ["./heroExamples.ts"],
  async load(): Promise<HeroHighlightedByLocale> {
    const docsDir = resolve(import.meta.dirname, "../../..");
    const md = await createMarkdownRenderer(docsDir);
    const locales: readonly HeroLocale[] = ["en", "ja", "zh"];

    const entries = locales.map((locale) => {
      const code = buildHeroSnippetCode(locale);
      const html = extractShikiPreBlock(md.render(`\`\`\`ts\n${code}\n\`\`\``));
      return [locale, html] as const;
    });

    return {
      en: entries[0][1],
      ja: entries[1][1],
      zh: entries[2][1],
    };
  },
});
