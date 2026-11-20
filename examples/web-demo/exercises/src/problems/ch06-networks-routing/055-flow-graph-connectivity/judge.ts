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

export interface P055Edge {
  u: number;
  v: number;
  cost: number;
}

export interface P055Input {
  prizes: number[];
  edges: P055Edge[];
}

export interface P055Output {
  selectedNodes: number[];
  selectedEdges: number[];
  netValue: number;
}

export function judge(
  input: P055Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.prizes.length;
  const mEdges = input.edges.length;

  const nodesRaw = expectNumericArray(
    output.selectedNodes,
    n,
    { en: "selectedNodes", ja: "selectedNodes", zh: "selectedNodes" },
    locale
  );
  if (typeof nodesRaw === "string") return runtimeError(nodesRaw);

  const edgesRaw = expectNumericArray(
    output.selectedEdges,
    mEdges,
    { en: "selectedEdges", ja: "selectedEdges", zh: "selectedEdges" },
    locale
  );
  if (typeof edgesRaw === "string") return runtimeError(edgesRaw);

  const valCheck = expectFiniteNumber(
    output.netValue,
    { en: "netValue", ja: "netValue", zh: "netValue" },
    locale
  );
  if (typeof valCheck === "string") return runtimeError(valCheck);

  const nodes: number[] = [];
  for (let v = 0; v < n; v++) {
    const val = nodesRaw[v];
    if (!checkIntegrality(val) || (Math.round(val) !== 0 && Math.round(val) !== 1)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: v, p1: roundNice(val) }));
    }
    nodes.push(Math.round(val) || 0);
  }
  if (nodes[0] !== 1) {
    return violation(JMSG[locale].m2);
  }

  const edges: number[] = [];
  const adj: number[][] = Array.from({ length: n }, () => []);
  let recomputed = 0;
  for (let v = 0; v < n; v++) {
    recomputed += input.prizes[v] * nodes[v];
  }

  for (let i = 0; i < mEdges; i++) {
    const val = edgesRaw[i];
    if (!checkIntegrality(val) || (Math.round(val) !== 0 && Math.round(val) !== 1)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: i, p1: roundNice(val) }));
    }
    const b = Math.round(val) || 0;
    edges.push(b);
    if (b === 1) {
      const e = input.edges[i];
      if (nodes[e.u] !== 1 || nodes[e.v] !== 1) {
        return violation(formatTemplate(JMSG[locale].m4, { p0: i, p1: e.u, p2: e.v }));
      }
      adj[e.u].push(e.v);
      adj[e.v].push(e.u);
      recomputed -= e.cost;
    }
  }

  // BFS from root 0 using selected edges to guarantee zero disconnected islands
  const reachable = new Array<boolean>(n).fill(false);
  reachable[0] = true;
  const q = [0];
  while (q.length > 0) {
    const u = q.shift()!;
    for (const v of adj[u]) {
      if (!reachable[v]) {
        reachable[v] = true;
        q.push(v);
      }
    }
  }

  for (let v = 0; v < n; v++) {
    if (nodes[v] === 1 && !reachable[v]) {
      return violation(formatTemplate(JMSG[locale].m5, { p0: v }));
    }
  }

  if (!approxEqual(valCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(valCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const activeList = nodes.map((b, v) => (b === 1 ? v : -1)).filter((v) => v >= 0);
  const preview = `nodes={${activeList.join(", ")}} | netValue=${roundNice(recomputed)}`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(recomputed),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: expectedOptimal }),
    preview
  );
}
