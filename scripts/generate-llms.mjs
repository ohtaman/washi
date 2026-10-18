import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DOC_SECTIONS = [
  {
    title: "Getting Started",
    dir: "getting-started",
    files: [
      "getting-started/ai-agents.md",
      "getting-started/index.md",
      "getting-started/runtimes.md",
      "getting-started/cross-origin.md",
    ],
  },
  {
    title: "Modeling Guide",
    dir: "guide",
    files: [
      "guide/variables.md",
      "guide/expressions.md",
      "guide/constraints.md",
      "guide/objectives.md",
      "guide/unsat-core.md",
    ],
  },
  {
    title: "Solvers",
    dir: "solvers",
    files: [
      "solvers/index.md",
      "solvers/highs.md",
      "solvers/z3.md",
      "solvers/glpk.md",
      "solvers/custom-solver.md",
    ],
  },
  {
    title: "Examples",
    dir: "examples",
    files: [
      "examples/index.md",
      "examples/production.md",
      "examples/knapsack.md",
      "examples/transportation.md",
      "examples/diet-sensitivity.md",
      "examples/shift-scheduling.md",
      "examples/ecommerce-coupons.md",
      "examples/portfolio-qp.md",
      "examples/smt-security.md",
      "examples/unsat-core.md",
    ],
  },
];

export const LLMS_FULL_SECTIONS = ["getting-started", "guide", "solvers", "examples"];

/**
 * Resolves the canonical ordered list of English documentation files per section,
 * appending any new `.md` files found in the directory in deterministic order.
 */
export function getCanonicalDocSections(docsDir = resolve(defaultRootDir, "docs")) {
  return DOC_SECTIONS.map((section) => {
    const absDir = resolve(docsDir, section.dir);
    const onDisk = existsSync(absDir)
      ? readdirSync(absDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => `${section.dir}/${f}`)
          .sort()
      : [];
    const seen = new Set(section.files);
    const extras = onDisk.filter((rel) => !seen.has(rel));
    return {
      title: section.title,
      dir: section.dir,
      files: [...section.files, ...extras],
    };
  });
}

/**
 * Strips VitePress-specific YAML frontmatter, container directives (`:::`),
 * and interactive Vue wrapper tags while preserving standard Markdown and code blocks.
 */
export function stripVitePressSyntax(rawMarkdown) {
  let text = rawMarkdown.replace(/\r\n/g, "\n");

  // Strip YAML frontmatter only when anchored at the start of the file and containing YAML keys
  const fmMatch = text.match(/^(?:\uFEFF)?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (fmMatch) {
    const body = fmMatch[1];
    const hasYamlKey = /^[A-Za-z0-9_-]+[ \t]*:/m.test(body);
    const hasMarkdownHeading = /^#[ \t]+/m.test(body);
    if (hasYamlKey && !hasMarkdownHeading) {
      text = text.slice(fmMatch[0].length);
    }
  }

  const lines = text.split("\n");
  const out = [];
  let fenceMarker = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^[ \t]*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fenceMarker) {
        fenceMarker = marker;
      } else if (fenceMarker === marker && /^[ \t]*(`{3,}|~{3,})[ \t]*$/.test(line)) {
        fenceMarker = null;
      }
      out.push(line);
      continue;
    }

    if (!fenceMarker) {
      // Strip VitePress container directives (e.g., `::: code-group`, `::: tip`, `:::`)
      if (/^[ \t]*:::(?:[ \t].*)?$/.test(line)) {
        continue;
      }
      // Strip VitePress custom Vue component tags in docs/examples
      if (
        /^[ \t]*<\/?CodeRunner\b[^>]*>[ \t]*$/.test(line) ||
        /^[ \t]*<(?:PortfolioQpDemo|EcommerceCouponDemo|ShiftSchedulingDemo)\b[^>]*\/>[ \t]*$/.test(line)
      ) {
        continue;
      }
    }

    out.push(line);
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extracts the H1 title and first descriptive summary sentence from a Markdown document.
 */
export function extractDocMetadata(rawMarkdown) {
  const cleaned = stripVitePressSyntax(rawMarkdown);
  const lines = cleaned.split("\n");

  let title = "";
  let summary = "";
  let inFence = false;
  const paragraphLines = [];

  const isAcceptableSummary = (candidate) =>
    Boolean(candidate) &&
    !/^Welcome to\b/i.test(candidate) &&
    /(?<!\bvs|\be\.g|\bi\.e)\.(?:\s|$)/.test(candidate);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (!title && line.startsWith("# ")) {
      title = line.slice(2).trim();
      continue;
    }
    if (!title) continue;

    if (!line) {
      if (paragraphLines.length > 0) {
        const candidate = paragraphLines.join(" ").trim();
        if (isAcceptableSummary(candidate)) {
          summary = candidate;
          break;
        }
        paragraphLines.length = 0;
      }
      continue;
    }

    // Skip horizontal rules, headings, tables, list items, and HTML blocks when looking for the lead paragraph
    if (
      line === "---" ||
      line.startsWith("#") ||
      line.startsWith("|") ||
      line.startsWith("- ") ||
      line.startsWith("* ") ||
      /^\d+\.\s/.test(line) ||
      line.startsWith("<")
    ) {
      if (paragraphLines.length > 0) {
        const candidate = paragraphLines.join(" ").trim();
        if (isAcceptableSummary(candidate)) {
          summary = candidate;
          break;
        }
        paragraphLines.length = 0;
      }
      continue;
    }

    if (line.startsWith(">")) {
      const quoteText = line
        .replace(/^>[ \t]*/, "")
        .replace(/^\*\*Scope Note\*\*:[ \t]*/i, "")
        .trim();
      if (quoteText && !quoteText.startsWith("[!")) {
        paragraphLines.push(quoteText);
      }
      continue;
    }

    paragraphLines.push(line);
  }

  if (!summary && paragraphLines.length > 0) {
    summary = paragraphLines.join(" ").trim();
  }

  // Unwrap inline markdown links `[label](url)` -> `label` so subfolder-relative links do not leak into root llms.txt
  summary = summary.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Keep the first sentence for concise index entries (avoiding abbreviations like `vs.`, `e.g.`, `i.e.`)
  const firstSentenceMatch = summary.match(/^(.+?(?<!\bvs|\be\.g|\bi\.e)\.)(?:\s|$)/);
  if (firstSentenceMatch) {
    summary = firstSentenceMatch[1];
  }

  return { title, summary };
}

/**
 * Extracts key modeling rules directly from `docs/getting-started/ai-agents.md`
 * and overview text from `docs/getting-started/index.md` without maintaining duplicate prose by hand.
 */
function buildLlmsTxtContent(rootDir, sections) {
  const docsDir = resolve(rootDir, "docs");
  const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
  const introMd = readFileSync(resolve(docsDir, "getting-started/index.md"), "utf8").replace(
    /\r\n/g,
    "\n"
  );
  const aiAgentsMd = readFileSync(resolve(docsDir, "getting-started/ai-agents.md"), "utf8").replace(
    /\r\n/g,
    "\n"
  );

  const { summary: introOverview } = extractDocMetadata(introMd);

  // Extract section 1 import/runtime rules, section 2 workflow, and section 4 pitfalls from ai-agents.md
  const sec1Match = aiAgentsMd.match(/## 1\. Package Imports & Deployment\n+([\s\S]*?)\n---\n/);
  const sec2Match = aiAgentsMd.match(/## 2\. Canonical Modeling Workflow\n+([\s\S]*?)\n---\n/);
  const sec4Match = aiAgentsMd.match(/## 4\. Negative Examples & Common Pitfalls\n+([\s\S]*)$/);

  if (!sec1Match || !sec2Match || !sec4Match) {
    throw new Error("Failed to extract canonical sections from docs/getting-started/ai-agents.md");
  }

  // Extract negative rules comments from section 4 code block
  const sec4CodeMatch = sec4Match[1].match(/```(?:ts|typescript)\n([\s\S]*?)```/);
  const negativeRules = sec4CodeMatch
    ? sec4CodeMatch[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("//"))
        .map((line) => line.replace(/^\/\/[ \t]?/, ""))
        .filter(Boolean)
        .map((line) => (line.startsWith("WRONG:") ? `  - \`\` ${line} \`\`` : line.startsWith("- ") ? `  ${line}` : line))
    : [];

  const docIndexLines = [];
  for (const section of sections) {
    docIndexLines.push(`### ${section.title}`, "");
    for (const relPath of section.files) {
      const raw = readFileSync(resolve(docsDir, relPath), "utf8");
      const { title, summary } = extractDocMetadata(raw);
      docIndexLines.push(`- [${title}](${relPath})${summary ? `: ${summary}` : ""}`);
    }
    docIndexLines.push("");
  }

  return (
    [
      `# WaSHI (${pkg.name})`,
      "",
      `> ${pkg.description}`,
      "",
      introOverview,
      "",
      "- Full single-file documentation reference: [llms-full.txt](llms-full.txt)",
      "- Canonical AI agent modeling quick-reference: [getting-started/ai-agents.md](getting-started/ai-agents.md)",
      "",
      "---",
      "",
      "## 1. Package Imports & Deployment",
      "",
      sec1Match[1].trim(),
      "",
      "---",
      "",
      "## 2. Canonical Modeling Workflow & Key Rules",
      "",
      sec2Match[1].trim(),
      "",
      "---",
      "",
      "## 3. Common Pitfalls & Retired Aliases",
      "",
      ...negativeRules,
      "",
      "---",
      "",
      "## 4. Canonical English Documentation Index",
      "",
      "> On the documentation site (`https://ohtaman.github.io/washi/`), these paths resolve relative to the site root. In a repository checkout or installed npm package (`node_modules/@ohtaman/washi/`), the Markdown files are located under `docs/` alongside `llms-full.txt` at the package root.",
      "",
      ...docIndexLines,
    ]
      .join("\n")
      .trimEnd() + "\n"
  );
}

/**
 * Concatenates `docs/getting-started/ai-agents.md` followed by the canonical English
 * Getting Started, Modeling Guide, Solver, and Example documentation files, stripped of
 * VitePress-specific YAML frontmatter and container directives.
 */
function buildLlmsFullTxtContent(rootDir, sections) {
  const docsDir = resolve(rootDir, "docs");
  const fullSectionSet = new Set(LLMS_FULL_SECTIONS);
  const orderedFiles = [];

  for (const section of sections) {
    if (!fullSectionSet.has(section.dir)) continue;
    for (const relPath of section.files) {
      if (!orderedFiles.includes(relPath)) {
        orderedFiles.push(relPath);
      }
    }
  }

  const parts = orderedFiles.map((relPath) => {
    const raw = readFileSync(resolve(docsDir, relPath), "utf8");
    return stripVitePressSyntax(raw);
  });

  return parts.join("\n\n---\n\n").trimEnd() + "\n";
}

/**
 * Generates `llms.txt` and `llms-full.txt` deterministically from the English docs.
 */
export function buildLlmsArtifacts(rootDir = defaultRootDir) {
  const docsDir = resolve(rootDir, "docs");
  const sections = getCanonicalDocSections(docsDir);
  const allDocFiles = sections.flatMap((s) => s.files);
  const llmsTxt = buildLlmsTxtContent(rootDir, sections);
  const llmsFullTxt = buildLlmsFullTxtContent(rootDir, sections);

  return {
    llmsTxt,
    llmsFullTxt,
    sections,
    allDocFiles,
  };
}

/**
 * Writes `llms.txt`, `llms-full.txt`, and copies all canonical raw English `.md` files
 * into a built site directory (such as `dist/site` or `docs/.vitepress/dist`).
 */
export function populateSiteLlmsAssets(targetSiteDir, rootDir = defaultRootDir, artifacts = buildLlmsArtifacts(rootDir)) {
  const docsDir = resolve(rootDir, "docs");
  mkdirSync(targetSiteDir, { recursive: true });
  writeFileSync(resolve(targetSiteDir, "llms.txt"), artifacts.llmsTxt, "utf8");
  writeFileSync(resolve(targetSiteDir, "llms-full.txt"), artifacts.llmsFullTxt, "utf8");

  const filesToCopy = [...artifacts.allDocFiles];
  if (existsSync(resolve(docsDir, "index.md")) && !filesToCopy.includes("index.md")) {
    filesToCopy.push("index.md");
  }

  for (const relPath of filesToCopy) {
    const srcPath = resolve(docsDir, relPath);
    const destPath = resolve(targetSiteDir, relPath);
    mkdirSync(dirname(destPath), { recursive: true });
    cpSync(srcPath, destPath);
  }
}

/**
 * Generates root `llms.txt` and `llms-full.txt` (for npm packaging and local inspection),
 * and populates `docs/.vitepress/dist` and `dist/site` if they already exist.
 */
export function generateLlms(rootDir = defaultRootDir) {
  const artifacts = buildLlmsArtifacts(rootDir);
  writeFileSync(resolve(rootDir, "llms.txt"), artifacts.llmsTxt, "utf8");
  writeFileSync(resolve(rootDir, "llms-full.txt"), artifacts.llmsFullTxt, "utf8");

  const vitepressDist = resolve(rootDir, "docs/.vitepress/dist");
  if (existsSync(vitepressDist)) {
    populateSiteLlmsAssets(vitepressDist, rootDir, artifacts);
  }

  const siteDist = resolve(rootDir, "dist/site");
  if (existsSync(siteDist)) {
    populateSiteLlmsAssets(siteDist, rootDir, artifacts);
  }

  return artifacts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { allDocFiles } = generateLlms(defaultRootDir);
  console.log(`Generated llms.txt and llms-full.txt (${allDocFiles.length} canonical English doc endpoints).`);
}
