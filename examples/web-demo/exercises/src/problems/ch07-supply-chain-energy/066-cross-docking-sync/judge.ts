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

export interface P066Input {
  supplies: number[][];
  demands: number[][];
  arrivalTimes: number[];
  dueTimes: number[];
  inDoorCaps: number[];
  outDoorCaps: number[];
  handlingCosts: number[][];
  transferTimes: number[][];
  delayCost: number;
}

export interface P066Output {
  inDoor: number[];
  outDoor: number[];
  flows: number[][][];
  departures: number[];
  totalCost: number;
}

export function judge(
  input: P066Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nIn = input.supplies.length;
  const nOut = input.demands.length;
  const nComms = input.supplies[0]?.length ?? 0;
  const nInDoors = input.inDoorCaps.length;
  const nOutDoors = input.outDoorCaps.length;

  const inDoorRaw = expectNumericArray(
    output.inDoor,
    nIn,
    { en: "inDoor", ja: "inDoor", zh: "inDoor" },
    locale
  );
  if (typeof inDoorRaw === "string") return runtimeError(inDoorRaw);

  const outDoorRaw = expectNumericArray(
    output.outDoor,
    nOut,
    { en: "outDoor", ja: "outDoor", zh: "outDoor" },
    locale
  );
  if (typeof outDoorRaw === "string") return runtimeError(outDoorRaw);

  if (!Array.isArray(output.flows) || output.flows.length !== nIn) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: nIn }));
  }

  const flows: number[][][] = [];
  for (let i = 0; i < nIn; i++) {
    if (!Array.isArray(output.flows[i]) || output.flows[i].length !== nOut) {
      return runtimeError(formatTemplate(JMSG[locale].m2, { p0: i, p1: nOut }));
    }
    const rowFlows: number[][] = [];
    for (let j = 0; j < nOut; j++) {
      const commArr = expectNumericArray(
        output.flows[i][j],
        nComms,
        {
          en: `flows[${i}][${j}]`,
          ja: `flows[${i}][${j}]`,
          zh: `flows[${i}][${j}]`,
        },
        locale
      );
      if (typeof commArr === "string") return runtimeError(commArr);
      rowFlows.push(commArr);
    }
    flows.push(rowFlows);
  }

  const departures = expectNumericArray(
    output.departures,
    nOut,
    { en: "departures", ja: "departures", zh: "departures" },
    locale
  );
  if (typeof departures === "string") return runtimeError(departures);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  for (let i = 0; i < nIn; i++) {
    for (let j = 0; j < nOut; j++) {
      const commArr = flows[i][j];
      for (let k = 0; k < nComms; k++) {
        if (commArr[k] < -1e-6) {
          return violation(
            formatTemplate(JMSG[locale].m3, {
              p0: i,
              p1: j,
              p2: k,
              p3: roundNice(commArr[k]),
            })
          );
        }
      }
    }
  }

  const inDoorClean: number[] = [];
  const inDoorCounts = new Array<number>(nInDoors).fill(0);
  for (let i = 0; i < nIn; i++) {
    const r = inDoorRaw[i];
    if (!checkIntegrality(r)) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: "inDoor",
          p1: i,
          p2: roundNice(r),
          p3: nInDoors - 1,
        })
      );
    }
    const rInt = Math.round(r);
    if (rInt < 0 || rInt >= nInDoors) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: "inDoor",
          p1: i,
          p2: rInt,
          p3: nInDoors - 1,
        })
      );
    }
    inDoorClean.push(rInt);
    inDoorCounts[rInt]++;
  }

  for (let r = 0; r < nInDoors; r++) {
    if (inDoorCounts[r] > input.inDoorCaps[r]) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: r,
          p1: inDoorCounts[r],
          p2: input.inDoorCaps[r],
        })
      );
    }
  }

  const outDoorClean: number[] = [];
  const outDoorCounts = new Array<number>(nOutDoors).fill(0);
  for (let j = 0; j < nOut; j++) {
    const s = outDoorRaw[j];
    if (!checkIntegrality(s)) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: "outDoor",
          p1: j,
          p2: roundNice(s),
          p3: nOutDoors - 1,
        })
      );
    }
    const sInt = Math.round(s);
    if (sInt < 0 || sInt >= nOutDoors) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: "outDoor",
          p1: j,
          p2: sInt,
          p3: nOutDoors - 1,
        })
      );
    }
    outDoorClean.push(sInt);
    outDoorCounts[sInt]++;

    if (departures[j] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m6, { p0: j, p1: roundNice(departures[j]) })
      );
    }
  }

  for (let s = 0; s < nOutDoors; s++) {
    if (outDoorCounts[s] > input.outDoorCaps[s]) {
      return violation(
        formatTemplate(JMSG[locale].m7, {
          p0: s,
          p1: outDoorCounts[s],
          p2: input.outDoorCaps[s],
        })
      );
    }
  }

  for (let i = 0; i < nIn; i++) {
    for (let k = 0; k < nComms; k++) {
      let shipped = 0;
      for (let j = 0; j < nOut; j++) shipped += flows[i][j][k];
      if (shipped > input.supplies[i][k] + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m8, {
            p0: i,
            p1: k,
            p2: roundNice(shipped),
            p3: input.supplies[i][k],
          })
        );
      }
    }
  }

  for (let j = 0; j < nOut; j++) {
    for (let k = 0; k < nComms; k++) {
      let received = 0;
      for (let i = 0; i < nIn; i++) received += flows[i][j][k];
      if (received < input.demands[j][k] - 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m9, {
            p0: j,
            p1: k,
            p2: roundNice(received),
            p3: input.demands[j][k],
          })
        );
      }
    }
  }

  let handlingTotal = 0;
  for (let i = 0; i < nIn; i++) {
    const r = inDoorClean[i];
    for (let j = 0; j < nOut; j++) {
      const s = outDoorClean[j];
      const pairFlow = flows[i][j].reduce((acc, v) => acc + v, 0);
      if (pairFlow > 1e-4) {
        const minDep = input.arrivalTimes[i] + input.transferTimes[r][s];
        if (departures[j] < minDep - 1e-4) {
          return violation(
            formatTemplate(JMSG[locale].m10, {
              p0: j,
              p1: roundNice(departures[j]),
              p2: i,
              p3: roundNice(minDep),
            })
          );
        }
      }
      handlingTotal += pairFlow * input.handlingCosts[r][s];
    }
  }

  let delayTotal = 0;
  for (let j = 0; j < nOut; j++) {
    const tard = Math.max(0, departures[j] - input.dueTimes[j]);
    delayTotal += input.delayCost * tard;
  }

  const recomputed = handlingTotal + delayTotal;
  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m11, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `in=[${inDoorClean.join(",")}] | out=[${outDoorClean.join(",")}] | totalCost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m12, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m13, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
