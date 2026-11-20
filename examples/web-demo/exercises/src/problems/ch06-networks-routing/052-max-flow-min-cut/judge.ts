import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
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

export interface P052Edge {
  from: number;
  to: number;
  cap: number;
}

export interface P052Input {
  nodeCount: number;
  source: number;
  sink: number;
  edges: P052Edge[];
}

export interface P052Output {
  flows: number[];
  cutEdges: number[];
  maxFlow: number;
}

export function judge(
  input: P052Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const mEdges = input.edges.length;
  const nNodes = input.nodeCount;

  const flows = expectNumericArray(
    output.flows,
    mEdges,
    { en: "flows", ja: "flows", zh: "flows" },
    locale
  );
  if (typeof flows === "string") return runtimeError(flows);

  if (!Array.isArray(output.cutEdges)) {
    return runtimeError(JMSG[locale].m1);
  }
  const rawCutEdges: number[] = [];
  for (let idx = 0; idx < output.cutEdges.length; idx++) {
    const eid = output.cutEdges[idx];
    if (typeof eid !== "number" || !Number.isFinite(eid)) {
      return runtimeError(formatTemplate(JMSG[locale].m2, { p0: idx, p1: String(eid), p2: mEdges - 1 }));
    }
    rawCutEdges.push(eid);
  }

  const maxFlowCheck = expectFiniteNumber(
    output.maxFlow,
    { en: "maxFlow", ja: "maxFlow", zh: "maxFlow" },
    locale
  );
  if (typeof maxFlowCheck === "string") return runtimeError(maxFlowCheck);

  const cutSet = new Set<number>();
  for (let idx = 0; idx < rawCutEdges.length; idx++) {
    const eid = rawCutEdges[idx];
    if (!Number.isInteger(eid) || eid < 0 || eid >= mEdges) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: idx, p1: String(eid), p2: mEdges - 1 }));
    }
    if (cutSet.has(eid)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: eid }));
    }
    cutSet.add(eid);
  }

  const netOut = new Array<number>(nNodes).fill(0);
  for (let i = 0; i < mEdges; i++) {
    const f = flows[i];
    const edge = input.edges[i];
    if (f < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: i, p1: roundNice(f) }));
    }
    if (f > edge.cap + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m5, { p0: i, p1: roundNice(f), p2: edge.cap })
      );
    }
    netOut[edge.from] += f;
    netOut[edge.to] -= f;
  }

  for (let v = 0; v < nNodes; v++) {
    if (v === input.source || v === input.sink) continue;
    if (Math.abs(netOut[v]) > 1e-4) {
      return violation(formatTemplate(JMSG[locale].m6, { p0: v, p1: roundNice(netOut[v]) }));
    }
  }

  const sourceFlow = netOut[input.source];
  const sinkFlow = -netOut[input.sink];
  if (!approxEqual(maxFlowCheck, sourceFlow, 1e-2) || !approxEqual(maxFlowCheck, sinkFlow, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(maxFlowCheck),
        p1: roundNice(sourceFlow),
      })
    );
  }

  // Verify cutEdges blocks every directed path from source to sink
  const blockedReach = new Array<boolean>(nNodes).fill(false);
  blockedReach[input.source] = true;
  const q = [input.source];
  while (q.length > 0) {
    const u = q.shift()!;
    for (let i = 0; i < mEdges; i++) {
      if (cutSet.has(i)) continue;
      const e = input.edges[i];
      if (e.from === u && !blockedReach[e.to]) {
        blockedReach[e.to] = true;
        q.push(e.to);
      }
    }
  }
  if (blockedReach[input.sink]) {
    return violation(JMSG[locale].m8);
  }

  let cutCap = 0;
  for (const eid of cutSet) {
    cutCap += input.edges[eid].cap;
  }
  if (!approxEqual(cutCap, sourceFlow, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m9, {
        p0: roundNice(cutCap),
        p1: roundNice(sourceFlow),
      })
    );
  }

  const preview = `maxFlow=${roundNice(sourceFlow)} | cutEdges=[${[...cutSet].sort((a, b) => a - b).join(", ")}] | cutCap=${roundNice(cutCap)}`;

  if (sourceFlow < expectedOptimal - 1e-2) {
    return suboptimal(
      sourceFlow,
      expectedOptimal,
      formatTemplate(JMSG[locale].m10, {
        p0: roundNice(sourceFlow),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m11, { p0: expectedOptimal }),
    preview
  );
}
