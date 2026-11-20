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

export interface P037Input {
  stripWidth: number;
  widths: number[];
  heights: number[];
}

export interface P037Output {
  x: number[];
  y: number[];
  height: number;
}

export function judge(
  input: P037Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.widths.length;
  const xRaw = expectNumericArray(output.x, n, { en: "x", ja: "x", zh: "x" }, locale);
  if (typeof xRaw === "string") return runtimeError(xRaw);

  const yRaw = expectNumericArray(output.y, n, { en: "y", ja: "y", zh: "y" }, locale);
  if (typeof yRaw === "string") return runtimeError(yRaw);

  const hCheck = expectFiniteNumber(
    output.height,
    { en: "height", ja: "height", zh: "height" },
    locale
  );
  if (typeof hCheck === "string") return runtimeError(hCheck);

  const xs: number[] = [];
  const ys: number[] = [];
  let maxH = 0;

  for (let i = 0; i < n; i++) {
    if (!checkIntegrality(xRaw[i]) || !checkIntegrality(yRaw[i])) {
      return violation(
        formatTemplate(JMSG[locale].m1, {
          p0: i,
          p1: roundNice(xRaw[i]),
          p2: roundNice(yRaw[i]),
        })
      );
    }
    const xi = Math.round(xRaw[i]);
    const yi = Math.round(yRaw[i]);
    if (xi < 0 || xi + input.widths[i] > input.stripWidth || yi < 0) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: i,
          p1: xi,
          p2: xi + input.widths[i],
          p3: yi,
          p4: input.stripWidth,
        })
      );
    }
    xs.push(xi);
    ys.push(yi);
    const top = yi + input.heights[i];
    if (top > maxH) maxH = top;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const overlapX = xs[i] < xs[j] + input.widths[j] && xs[j] < xs[i] + input.widths[i];
      const overlapY = ys[i] < ys[j] + input.heights[j] && ys[j] < ys[i] + input.heights[i];
      if (overlapX && overlapY) {
        return violation(
          formatTemplate(JMSG[locale].m3, {
            p0: i,
            p1: j,
            p2: `(${xs[i]}, ${ys[i]})`,
            p3: `(${xs[j]}, ${ys[j]})`,
          })
        );
      }
    }
  }

  if (!approxEqual(hCheck, maxH, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice(hCheck), p1: maxH })
    );
  }

  const preview = `coords=[${xs.map((xi, i) => `(${xi},${ys[i]})`).join(", ")}] | height=${maxH}`;

  if (maxH > expectedOptimal + 1e-2) {
    return suboptimal(
      maxH,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, { p0: maxH, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m6, { p0: expectedOptimal }),
    preview
  );
}
