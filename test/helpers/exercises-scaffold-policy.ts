/**
 * Scaffolding & hint-ladder policy for Optimization 100 exercises (Chapter 2+).
 *
 * See `examples/web-demo/exercises/AGENTS.md` ("Scaffolding & Hint Ladder") for the
 * human-readable rules. These pure checkers return a list of violation messages so that
 * chapter suites can report every offending exercise at once.
 */

export type ScaffoldTier = "guided" | "fill-in" | "scratch";

/** Chapter 2 may predeclare variables, Chapters 3-5 must not, Chapter 6+ starts from scratch. */
export function scaffoldTierForChapter(chapter: number): ScaffoldTier {
  if (chapter <= 2) return "guided";
  if (chapter <= 5) return "fill-in";
  return "scratch";
}

export const MAX_STARTER_COMMENT_LINES = 3;

/** Formula-level tokens that turn a starter TODO into a transcription recipe. */
const FORMULA_TOKEN_RE = /<=|>=|==|!=|\bsum\s*\(|\bdot\s*\(|\blpSum\s*\(|\blpDot\s*\(|\bexpr`|\bquicksum\s*\(/;

const WASHI_VARIABLE_DECL_RE = /\.\s*(?:binary|integer|continuous|bool)\s*\(/;
const PULP_VARIABLE_DECL_RE = /\bLpVariable\b/;
const WASHI_MODEL_RE = /\bnew\s+Model\s*\(/;
const PULP_MODEL_RE = /\bLpProblem\s*\(/;

export interface StarterComments {
  lines: string[];
}

/** Extract `//` line comments (excluding `://` in URLs) and `/* ... *\/` block comment lines. */
export function extractTsComments(source: string): string[] {
  const out: string[] = [];
  for (const block of source.matchAll(/\/\*([\s\S]*?)\*\//g)) {
    for (const line of block[1].split("\n")) {
      const trimmed = line.replace(/^\s*\*?\s?/, "").trim();
      if (trimmed.length > 0) out.push(trimmed);
    }
  }
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const line of withoutBlocks.split("\n")) {
    const m = /(?<!:)\/\/(.*)$/.exec(line);
    if (m && m[1].trim().length > 0) out.push(m[1].trim());
  }
  return out;
}

/** Extract `#` comments outside of the solve() docstring. */
export function extractPyComments(source: string): string[] {
  const out: string[] = [];
  for (const line of source.split("\n")) {
    const m = /^\s*#(.*)$/.exec(line) ?? /\s#(?!.*["'])(.*)$/.exec(line);
    if (m && m[1].trim().length > 0) out.push(m[1].trim());
  }
  return out;
}

/** Return the body of `solve(...) { ... }` (TypeScript) using brace matching. */
export function extractTsSolveBody(source: string): string | null {
  const sig = /export\s+async\s+function\s+solve\s*\([^)]*\)\s*:\s*Promise<[^>]*>\s*\{/.exec(source);
  if (!sig) return null;
  let depth = 1;
  const start = sig.index + sig[0].length;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i);
    }
  }
  return null;
}

/** Return the indented body of `def solve(...)` (Python). */
export function extractPySolveBody(source: string): string | null {
  const lines = source.split("\n");
  const idx = lines.findIndex((l) => /^def\s+solve\s*\(/.test(l));
  if (idx < 0) return null;
  const body: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length > 0 && !/^\s/.test(line)) break;
    body.push(line);
  }
  return body.join("\n");
}

function isScratchTsBody(body: string): boolean {
  const code = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(?<!:)\/\/.*$/, "").trim())
    .filter((l) => l.length > 0);
  return code.length === 1 && /^throw new Error\((["'`]).*\1\);$/.test(code[0]);
}

function isScratchPyBody(body: string): boolean {
  const withoutDocstring = body.replace(/^\s*("""[\s\S]*?"""|'''[\s\S]*?''')/, "");
  const code = withoutDocstring
    .split("\n")
    .map((l) => l.replace(/^\s*#.*$/, "").trim())
    .filter((l) => l.length > 0);
  return code.length === 1 && /^raise NotImplementedError(\(.*\))?$/.test(code[0]);
}

export interface ScaffoldPolicyInput {
  id: string;
  chapter: number;
  scaffold: string;
  washiStarter: string;
  /** Empty string for WaSHI-only exercises. */
  highspyStarter: string;
  /** Parsed problem-tab sections per locale. */
  sections: Record<string, { hint1: string; hint2: string; formulation: string }>;
}

export function checkScaffoldPolicy(input: ScaffoldPolicyInput): string[] {
  const { id, chapter, scaffold, washiStarter, highspyStarter, sections } = input;
  const tier = scaffoldTierForChapter(chapter);
  const errors: string[] = [];
  const starters: Array<{ label: string; source: string; lang: "ts" | "py" }> = [
    { label: "washi/starter.ts", source: washiStarter, lang: "ts" },
  ];
  if (highspyStarter.trim().length > 0) {
    starters.push({ label: "highspy/starter.py", source: highspyStarter, lang: "py" });
  }

  if (tier === "scratch" && scaffold !== "scratch") {
    errors.push(`#${id}: Chapter ${chapter} exercises must use meta.scaffold "scratch" (received "${scaffold}").`);
  }
  if (scaffold !== "fill-in" && scaffold !== "scratch") {
    errors.push(`#${id}: meta.scaffold must be "fill-in" or "scratch" (received "${scaffold}").`);
  }

  for (const { label, source, lang } of starters) {
    const comments = lang === "ts" ? extractTsComments(source) : extractPyComments(source);
    if (comments.length > MAX_STARTER_COMMENT_LINES) {
      errors.push(
        `#${id} ${label}: at most ${MAX_STARTER_COMMENT_LINES} comment lines allowed (found ${comments.length}); move guidance into hint1 / hint2.`
      );
    }
    for (const c of comments) {
      if (FORMULA_TOKEN_RE.test(c)) {
        errors.push(`#${id} ${label}: comment reveals a formula ("${c}"); describe goals in words or move it to hints.`);
      }
    }

    if (tier !== "guided") {
      const declRe = lang === "ts" ? WASHI_VARIABLE_DECL_RE : PULP_VARIABLE_DECL_RE;
      if (declRe.test(source)) {
        errors.push(`#${id} ${label}: Chapter ${chapter} starters must not predeclare decision variables.`);
      }
    }

    if (scaffold === "scratch") {
      const modelRe = lang === "ts" ? WASHI_MODEL_RE : PULP_MODEL_RE;
      if (modelRe.test(source)) {
        errors.push(`#${id} ${label}: scratch starters must not construct a model.`);
      }
      const body = lang === "ts" ? extractTsSolveBody(source) : extractPySolveBody(source);
      const ok = body !== null && (lang === "ts" ? isScratchTsBody(body) : isScratchPyBody(body));
      if (!ok) {
        errors.push(
          `#${id} ${label}: scratch solve() body must contain only TODO comments and a not-implemented ${
            lang === "ts" ? "throw" : "raise"
          }.`
        );
      }
    }
  }

  for (const [locale, s] of Object.entries(sections)) {
    if (s.hint1.trim().length === 0) errors.push(`#${id} (${locale}): missing <!-- section:hint1 -->.`);
    if (s.hint2.trim().length === 0) errors.push(`#${id} (${locale}): missing <!-- section:hint2 -->.`);
    if (s.formulation.trim().length > 0) {
      errors.push(`#${id} (${locale}): keep the full formulation in the Editorial tab, not section:formulation.`);
    }
    for (const [name, text] of [
      ["hint1", s.hint1],
      ["hint2", s.hint2],
    ] as const) {
      if (text.includes("```")) {
        errors.push(`#${id} (${locale}) ${name}: hints must not contain fenced code blocks.`);
      }
    }
  }

  return errors;
}
