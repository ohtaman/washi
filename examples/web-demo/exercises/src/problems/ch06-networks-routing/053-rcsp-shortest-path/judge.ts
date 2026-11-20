import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
  checkIntegrality,
  expectFiniteNumber,
  expectNumericArray,
  formatTemplate,
  isRecord,
  roundNice,
  runtimeError,
  suboptimal,
  violation,
} from "../../judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P053Edge {
  from: number;
  to: number;
  cost: number;
  resource: number;
}

export interface P053Input {
  nodeCount: number;
  source: number;
  sink: number;
  maxResource: number;
  edges: P053Edge[];
}

export interface P053Output {
  selected: number[];
  totalCost: number;
}

export function judge(
  input: P053Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const mEdges = input.edges.length;
  const nNodes = input.nodeCount;

  const selRaw = expectNumericArray(
    output.selected,
    mEdges,
    { en: "selected", ja: "selected", zh: "selected" },
    locale
  );
  if (typeof selRaw === "string") return runtimeError(selRaw);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const selected: number[] = [];
  const netOut = new Array<number>(nNodes).fill(0);
  const outAdj: number[][] = Array.from({ length: nNodes }, () => []);
  let activeCount = 0;
  let resourceUsed = 0;
  let recomputedCost = 0;

  for (let i = 0; i < mEdges; i++) {
    const v = selRaw[i];
    if (!checkIntegrality(v) || (Math.round(v) !== 0 && Math.round(v) !== 1)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(v) }));
    }
    const b = Math.round(v) || 0;
    selected.push(b);
    if (b === 1) {
      const edge = input.edges[i];
      activeCount++;
      netOut[edge.from] += 1;
      netOut[edge.to] -= 1;
      outAdj[edge.from].push(edge.to);
      resourceUsed += edge.resource;
      recomputedCost += edge.cost;
    }
  }

  for (let v = 0; v < nNodes; v++) {
    const expectedBal = v === input.source ? 1 : v === input.sink ? -1 : 0;
    if (netOut[v] !== expectedBal) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: v,
          p1: netOut[v],
          p2: expectedBal,
        })
      );
    }
  }

  // Verify chosen edges form a single simple s->t path with no disconnected cycles
  const pathNodes = [input.source];
  const seenNodes = new Set<number>([input.source]);
  let cur = input.source;
  let walkedEdges = 0;
  while (cur !== input.sink) {
    if (outAdj[cur].length !== 1) {
      return violation(JMSG[locale].m3);
    }
    const nxt = outAdj[cur][0];
    if (seenNodes.has(nxt)) {
      return violation(JMSG[locale].m3);
    }
    seenNodes.add(nxt);
    pathNodes.push(nxt);
    walkedEdges++;
    cur = nxt;
  }
  if (walkedEdges !== activeCount || outAdj[input.sink].length !== 0) {
    return violation(JMSG[locale].m3);
  }

  if (resourceUsed > input.maxResource + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(resourceUsed),
        p1: input.maxResource,
      })
    );
  }

  if (!approxEqual(costCheck, recomputedCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputedCost),
      })
    );
  }

  const preview = `path=[${pathNodes.join(" -> ")}] | res=${roundNice(resourceUsed)}/${input.maxResource} | cost=${roundNice(recomputedCost)}`;

  if (recomputedCost > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputedCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(recomputedCost),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
