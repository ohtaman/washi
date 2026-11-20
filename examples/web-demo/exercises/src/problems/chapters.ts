import enLocale from "../locales/en.json";
import jaLocale from "../locales/ja.json";
import zhLocale from "../locales/zh.json";
import type { ChapterInfo, ParadigmId } from "../types.js";

const CHAPTER_SPEC: ReadonlyArray<{
  chapter: number;
  idRange: string;
  available: boolean;
  paradigms: ParadigmId[];
}> = [
  { chapter: 1, idRange: "001–010", available: true, paradigms: ["LP", "MIP"] },
  { chapter: 2, idRange: "011–020", available: false, paradigms: ["MIP"] },
  { chapter: 3, idRange: "021–030", available: false, paradigms: ["LP", "MIP"] },
  { chapter: 4, idRange: "031–040", available: false, paradigms: ["CP", "MIP"] },
  { chapter: 5, idRange: "041–050", available: false, paradigms: ["SMT"] },
  { chapter: 6, idRange: "051–060", available: false, paradigms: ["LP", "MIP", "CP"] },
  { chapter: 7, idRange: "061–070", available: false, paradigms: ["LP", "MIP"] },
  { chapter: 8, idRange: "071–080", available: false, paradigms: ["MIP", "CP"] },
  { chapter: 9, idRange: "081–090", available: false, paradigms: ["LP", "MIP", "QP"] },
  { chapter: 10, idRange: "091–100", available: false, paradigms: ["LP", "MIP", "CP", "SMT"] },
];

type ChapterKey = keyof typeof enLocale.chapters;

export const CHAPTERS: ChapterInfo[] = CHAPTER_SPEC.map((spec) => {
  const key = String(spec.chapter) as ChapterKey;
  return {
    chapter: spec.chapter,
    idRange: spec.idRange,
    available: spec.available,
    paradigms: spec.paradigms,
    title: {
      en: enLocale.chapters[key].title,
      ja: jaLocale.chapters[key].title,
      zh: zhLocale.chapters[key].title,
    },
    description: {
      en: enLocale.chapters[key].description,
      ja: jaLocale.chapters[key].description,
      zh: zhLocale.chapters[key].description,
    },
  };
});
