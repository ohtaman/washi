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

export interface P051Edge {
  from: number;
  to: number;
  cap: number;
  cost: number;
}

export interface P051Input {
  supplies: number[];
  edges: P051Edge[];
}

export interface P051Output {
  flows: number[];
  totalCost: number;
}

export function judge(
  input: P051Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const mEdges = input.edges.length;
  const nNodes = input.supplies.length;

  const flows = expectNumericArray(
    output.flows,
    mEdges,
    { en: "flows", ja: "flows", zh: "flows" },
    locale
  );
  if (typeof flows === "string") return runtimeError(flows);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const netOut = new Array<number>(nNodes).fill(0);
  let recomputed = 0;

  for (let i = 0; i < mEdges; i++) {
    const f = flows[i];
    const edge = input.edges[i];
    if (f < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(f) }));
    }
    if (f > edge.cap + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(f), p2: edge.cap })
      );
    }
    if (!checkIntegrality(f, 1e-4)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: i, p1: roundNice(f) }));
    }
    netOut[edge.from] += f;
    netOut[edge.to] -= f;
    recomputed += edge.cost * f;
  }

  for (let v = 0; v < nNodes; v++) {
    if (Math.abs(netOut[v] - input.supplies[v]) > 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: v,
          p1: roundNice(netOut[v]),
          p2: input.supplies[v],
        })
      );
    }
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `flows=[${flows.map((f) => roundNice(f)).join(", ")}] | totalCost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(recomputed),
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
