import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

type YamlValue = string | number | boolean | null | YamlObject | YamlValue[];
interface YamlObject {
  [key: string]: YamlValue;
}

interface ParsedLine {
  indent: number;
  text: string;
}

function unquoteScalar(raw: string): YamlValue {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && line[i - 1] !== "\\") {
      inDouble = !inDouble;
    } else if (ch === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line.trimEnd();
}

function parseSimpleYaml(source: string): YamlObject {
  const rawLines = source.split(/\r?\n/);
  const lines: ParsedLine[] = [];
  for (const raw of rawLines) {
    const cleaned = stripInlineComment(raw);
    if (cleaned.trim() === "") continue;
    const indent = cleaned.search(/\S/);
    lines.push({ indent, text: cleaned.slice(indent) });
  }

  let idx = 0;

  function parseBlock(minIndent: number): YamlValue {
    if (idx >= lines.length) return {};
    if (lines[idx].text.startsWith("- ") || lines[idx].text === "-") {
      return parseSequence(lines[idx].indent);
    }
    return parseMapping(minIndent);
  }

  function parseSequence(seqIndent: number): YamlValue[] {
    const arr: YamlValue[] = [];
    while (idx < lines.length && lines[idx].indent === seqIndent && lines[idx].text.startsWith("-")) {
      const rest = lines[idx].text.slice(1).trim();
      idx++;
      if (rest === "") {
        if (idx < lines.length && lines[idx].indent > seqIndent) {
          arr.push(parseBlock(lines[idx].indent));
        } else {
          arr.push(null);
        }
        continue;
      }

      const colonIdx = rest.indexOf(":");
      if (colonIdx !== -1 && !rest.startsWith("'") && !rest.startsWith('"')) {
        const key = rest.slice(0, colonIdx).trim();
        const valRaw = rest.slice(colonIdx + 1).trim();
        const item: YamlObject = {};
        if (valRaw === "") {
          if (idx < lines.length && lines[idx].indent > seqIndent) {
            item[key] = parseBlock(lines[idx].indent);
          } else {
            item[key] = null;
          }
        } else {
          item[key] = unquoteScalar(valRaw);
        }
        while (idx < lines.length && lines[idx].indent > seqIndent && !lines[idx].text.startsWith("-")) {
          const nested = parseMappingEntry(lines[idx].indent);
          Object.assign(item, nested);
        }
        arr.push(item);
      } else {
        arr.push(unquoteScalar(rest));
      }
    }
    return arr;
  }

  function parseMappingEntry(expectedIndent: number): YamlObject {
    const line = lines[idx];
    const colonIdx = line.text.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(`Invalid YAML mapping line: ${line.text}`);
    }
    const key = line.text.slice(0, colonIdx).trim();
    const rest = line.text.slice(colonIdx + 1).trim();
    idx++;

    if (rest === "|" || rest === ">") {
      const blockLines: string[] = [];
      const blockIndent = idx < lines.length ? lines[idx].indent : expectedIndent + 2;
      while (idx < lines.length && lines[idx].indent >= blockIndent) {
        blockLines.push(lines[idx].text);
        idx++;
      }
      return { [key]: blockLines.join("\n") };
    }

    if (rest === "") {
      if (idx < lines.length && lines[idx].indent > expectedIndent) {
        return { [key]: parseBlock(lines[idx].indent) };
      }
      return { [key]: {} };
    }

    return { [key]: unquoteScalar(rest) };
  }

  function parseMapping(minIndent: number): YamlObject {
    const obj: YamlObject = {};
    while (idx < lines.length && lines[idx].indent >= minIndent) {
      if (lines[idx].text.startsWith("-")) break;
      const entryIndent = lines[idx].indent;
      Object.assign(obj, parseMappingEntry(entryIndent));
    }
    return obj;
  }

  const root = parseMapping(0);
  return root;
}

interface WorkflowStep {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  env?: YamlObject;
  with?: YamlObject;
}

interface WorkflowJob {
  needs?: string | string[];
  environment?: { name?: string; url?: string };
  outputs?: Record<string, string>;
  steps: WorkflowStep[];
}

function asYamlObject(value: YamlValue | undefined): YamlObject {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function asStringMap(value: YamlValue | undefined): Record<string, string> {
  const obj = asYamlObject(value);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      out[k] = v;
    }
  }
  return out;
}

function toWorkflowJob(rawJob: YamlValue | undefined): WorkflowJob | undefined {
  if (rawJob === null || typeof rawJob !== "object" || Array.isArray(rawJob)) {
    return undefined;
  }
  const rawSteps = Array.isArray(rawJob.steps) ? rawJob.steps : [];
  const steps: WorkflowStep[] = rawSteps
    .filter((s): s is YamlObject => s !== null && typeof s === "object" && !Array.isArray(s))
    .map((s) => ({
      name: typeof s.name === "string" ? s.name : undefined,
      id: typeof s.id === "string" ? s.id : undefined,
      uses: typeof s.uses === "string" ? s.uses : undefined,
      run: typeof s.run === "string" ? s.run : undefined,
      env: s.env !== undefined ? asYamlObject(s.env) : undefined,
      with: s.with !== undefined ? asYamlObject(s.with) : undefined,
    }));

  const envObj = rawJob.environment !== undefined ? asYamlObject(rawJob.environment) : undefined;
  const environment =
    envObj !== undefined
      ? {
          name: typeof envObj.name === "string" ? envObj.name : undefined,
          url: typeof envObj.url === "string" ? envObj.url : undefined,
        }
      : undefined;

  const needs =
    typeof rawJob.needs === "string"
      ? rawJob.needs
      : Array.isArray(rawJob.needs)
        ? rawJob.needs.filter((item): item is string => typeof item === "string")
        : undefined;

  return {
    needs,
    environment,
    outputs: rawJob.outputs !== undefined ? asStringMap(rawJob.outputs) : undefined,
    steps,
  };
}

function resolveExpression(
  template: YamlValue,
  ctx: {
    runAttempt: number;
    steps: Record<string, { outputs: Record<string, string> }>;
    needs: Record<string, { outputs: Record<string, string> }>;
  }
): string {
  const raw = String(template ?? "");
  return raw.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_match, expr: string) => {
    if (expr === "github.run_attempt") {
      return String(ctx.runAttempt);
    }
    const stepOutMatch = expr.match(/^steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)$/);
    if (stepOutMatch) {
      const [, stepId, outKey] = stepOutMatch;
      return ctx.steps[stepId]?.outputs[outKey] ?? "";
    }
    const needsOutMatch = expr.match(/^needs\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)$/);
    if (needsOutMatch) {
      const [, jobId, outKey] = needsOutMatch;
      return ctx.needs[jobId]?.outputs[outKey] ?? "";
    }
    return "";
  });
}

function executeBuildJob(
  buildJob: WorkflowJob,
  runAttempt: number,
  uploadedArtifacts: string[]
): { outputs: Record<string, string> } {
  const stepCtx: Record<string, { outputs: Record<string, string> }> = {};

  for (const step of buildJob.steps) {
    const stepOutputs: Record<string, string> = {};
    if (step.run) {
      const resolvedEnv: Record<string, string> = {
        GITHUB_RUN_ATTEMPT: String(runAttempt),
      };
      for (const [k, v] of Object.entries(step.env ?? {})) {
        resolvedEnv[k] = resolveExpression(v, { runAttempt, steps: stepCtx, needs: {} });
      }
      const resolvedRun = resolveExpression(step.run, { runAttempt, steps: stepCtx, needs: {} });
      for (const match of resolvedRun.matchAll(
        /echo\s+"([a-zA-Z0-9_-]+)=([^"]+)"\s*>>\s*"?\$GITHUB_OUTPUT"?/g
      )) {
        const [, outKey, rawVal] = match;
        const expandedVal = rawVal.replace(/\$\{?([A-Z0-9_]+)\}?/g, (_m, envName: string) => {
          return resolvedEnv[envName] ?? "";
        });
        stepOutputs[outKey] = expandedVal;
      }
    }

    if (typeof step.uses === "string" && step.uses.startsWith("actions/upload-pages-artifact@")) {
      const artifactName = step.with?.name
        ? resolveExpression(step.with.name, { runAttempt, steps: stepCtx, needs: {} })
        : "github-pages";
      uploadedArtifacts.push(artifactName);
    }

    if (step.id) {
      stepCtx[step.id] = { outputs: stepOutputs };
    }
  }

  const jobOutputs: Record<string, string> = {};
  for (const [k, v] of Object.entries(buildJob.outputs ?? {})) {
    jobOutputs[k] = resolveExpression(v, { runAttempt, steps: stepCtx, needs: {} });
  }
  return { outputs: jobOutputs };
}

function executeDeployJob(
  deployJob: WorkflowJob,
  runAttempt: number,
  buildOutputs: Record<string, string>,
  uploadedArtifacts: string[]
): string {
  const deployStep = deployJob.steps.find(
    (s) => typeof s.uses === "string" && s.uses.startsWith("actions/deploy-pages@")
  );
  if (!deployStep) {
    throw new Error("Missing actions/deploy-pages step in deploy job");
  }
  const requestedName = deployStep.with?.artifact_name
    ? resolveExpression(deployStep.with.artifact_name, {
        runAttempt,
        steps: {},
        needs: { build: { outputs: buildOutputs } },
      })
    : "github-pages";

  const matches = uploadedArtifacts.filter((name) => name === requestedName);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly 1 artifact named "${requestedName}", found ${matches.length} (${JSON.stringify(uploadedArtifacts)})`
    );
  }
  return requestedName;
}

describe("GitHub Pages deploy-demo.yml re-run safety (Issue #409)", () => {
  const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-demo.yml");

  it("splits build and deploy jobs, sets cancel-in-progress to false, and scopes artifact names per build attempt", () => {
    const raw = fs.readFileSync(workflowPath, "utf-8");
    const workflow = parseSimpleYaml(raw);

    const concurrency = asYamlObject(workflow.concurrency);
    expect(concurrency.group).toBe("pages");
    expect(concurrency["cancel-in-progress"]).toBe(false);

    const rawJobs = asYamlObject(workflow.jobs);
    expect(rawJobs["build-and-deploy"]).toBeUndefined();
    const buildJob = toWorkflowJob(rawJobs.build);
    const deployJob = toWorkflowJob(rawJobs.deploy);
    expect(buildJob).toBeDefined();
    expect(deployJob).toBeDefined();
    if (!buildJob || !deployJob) return;

    // build job should not own the github-pages deployment environment
    expect(buildJob.environment).toBeUndefined();
    expect(buildJob.outputs?.artifact_name).toBeTruthy();

    const uploadStep = buildJob.steps.find(
      (s) => typeof s.uses === "string" && s.uses.startsWith("actions/upload-pages-artifact@")
    );
    expect(uploadStep).toBeDefined();
    expect(uploadStep?.with?.path).toBe("dist/site");
    expect(uploadStep?.with?.name).toBeTruthy();

    // deploy job waits on build and targets github-pages environment
    const needs = Array.isArray(deployJob.needs) ? deployJob.needs : [deployJob.needs];
    expect(needs).toContain("build");
    expect(deployJob.environment?.name).toBe("github-pages");
    expect(deployJob.environment?.url).toBe("${{ steps.deployment.outputs.page_url }}");

    const deployStep = deployJob.steps.find(
      (s) => typeof s.uses === "string" && s.uses.startsWith("actions/deploy-pages@")
    );
    expect(deployStep).toBeDefined();
    expect(deployStep?.id).toBe("deployment");
    expect(deployStep?.with?.artifact_name).toBe("${{ needs.build.outputs.artifact_name }}");
  });

  it("resolves a unique artifact on initial run, Re-run failed jobs, and Re-run all jobs without duplicate artifact collisions", () => {
    const raw = fs.readFileSync(workflowPath, "utf-8");
    const workflow = parseSimpleYaml(raw);
    const rawJobs = asYamlObject(workflow.jobs);
    const buildJob = toWorkflowJob(rawJobs.build);
    const deployJob = toWorkflowJob(rawJobs.deploy);
    expect(buildJob).toBeDefined();
    expect(deployJob).toBeDefined();
    if (!buildJob || !deployJob) return;

    // 1. Initial workflow run (attempt 1)
    const runArtifacts: string[] = [];
    const buildAttempt1 = executeBuildJob(buildJob, 1, runArtifacts);
    expect(buildAttempt1.outputs.artifact_name).toBe("github-pages-1");
    expect(runArtifacts).toEqual(["github-pages-1"]);
    expect(executeDeployJob(deployJob, 1, buildAttempt1.outputs, runArtifacts)).toBe(
      "github-pages-1"
    );

    // 2. Re-run failed jobs after deploy fails in attempt 1:
    //    build is skipped (reuses attempt 1 outputs), deploy executes with github.run_attempt = 2.
    expect(executeDeployJob(deployJob, 2, buildAttempt1.outputs, runArtifacts)).toBe(
      "github-pages-1"
    );
    expect(runArtifacts).toEqual(["github-pages-1"]);

    // 3. Re-run all jobs (attempt 2):
    //    build executes with github.run_attempt = 2 and uploads a new distinct artifact without colliding with attempt 1.
    const buildAttempt2 = executeBuildJob(buildJob, 2, runArtifacts);
    expect(buildAttempt2.outputs.artifact_name).toBe("github-pages-2");
    expect(runArtifacts).toEqual(["github-pages-1", "github-pages-2"]);
    expect(executeDeployJob(deployJob, 2, buildAttempt2.outputs, runArtifacts)).toBe(
      "github-pages-2"
    );
  });
});
