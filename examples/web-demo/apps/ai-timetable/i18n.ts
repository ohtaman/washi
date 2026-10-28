import {
  DAYS_OF_WEEK,
  type CohortId,
  type ConstraintMeta,
  type CourseCategory,
  type CourseProfile,
  type CustomTimetableRule,
  type EquipmentTag,
  type ProfessorProfile,
  type RoomProfile,
  type RoomType,
  type TimetableDay,
  type TimetablePeriod,
  type TimetableState,
} from "./types.js";

export type TimetableLang = "ja" | "en" | "zh";

export const TIMETABLE_LANG_STORAGE_KEY = "washi_games_lang";

export function detectBrowserTimetableLang(
  nav?: { languages?: readonly string[]; language?: string }
): TimetableLang {
  const navObj = nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  if (navObj) {
    const list = navObj.languages?.length
      ? navObj.languages
      : navObj.language
        ? [navObj.language]
        : [];
    for (const raw of list) {
      const lower = raw.toLowerCase();
      if (lower.startsWith("ja")) return "ja";
      if (lower.startsWith("zh")) return "zh";
      if (lower.startsWith("en")) return "en";
    }
  }
  return "en";
}

export function getTimetableLang(): TimetableLang {
  if (typeof window !== "undefined") {
    try {
      const q = new URLSearchParams(window.location.search).get("lang");
      if (q === "ja" || q === "en" || q === "zh") {
        return q;
      }
    } catch {
      // Ignore
    }
    try {
      const saved = window.localStorage.getItem(TIMETABLE_LANG_STORAGE_KEY);
      if (saved === "ja" || saved === "en" || saved === "zh") {
        return saved;
      }
    } catch {
      // Ignore
    }
    return detectBrowserTimetableLang();
  }
  return "en";
}

export function setTimetableLang(lang: TimetableLang): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TIMETABLE_LANG_STORAGE_KEY, lang);
    } catch {
      // Ignore
    }
  }
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }
}

export function pickTimetableLang<T>(
  lang: TimetableLang,
  map: { ja: T; en: T; zh: T }
): T {
  return map[lang] ?? map.ja;
}

export const DAY_SHORT_I18N: Record<TimetableLang, Record<TimetableDay, string>> = {
  ja: { Mon: "月", Tue: "火", Wed: "水", Thu: "木", Fri: "金" },
  en: { Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri" },
  zh: { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五" },
};

export const DAY_HEADER_I18N: Record<TimetableLang, Record<TimetableDay, string>> = {
  ja: { Mon: "月曜", Tue: "火曜", Wed: "水曜", Thu: "木曜", Fri: "金曜" },
  en: { Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri" },
  zh: { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五" },
};

export const DAY_FULL_I18N: Record<TimetableLang, Record<TimetableDay, string>> = {
  ja: { Mon: "月曜日", Tue: "火曜日", Wed: "水曜日", Thu: "木曜日", Fri: "金曜日" },
  en: { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" },
  zh: { Mon: "星期一", Tue: "星期二", Wed: "星期三", Thu: "星期四", Fri: "星期五" },
};

export function formatPeriodI18n(period: TimetablePeriod, lang: TimetableLang): string {
  if (lang === "en") return `P${period}`;
  if (lang === "zh") return `第${period}节`;
  return `${period}限`;
}

export function formatSlotI18n(
  day: TimetableDay,
  period: TimetablePeriod,
  lang: TimetableLang
): string {
  if (lang === "en") return `${DAY_SHORT_I18N.en[day]} P${period}`;
  if (lang === "zh") return `${DAY_SHORT_I18N.zh[day]}第${period}节`;
  return `${DAY_SHORT_I18N.ja[day]}曜${period}限`;
}

export const COHORT_I18N: Record<
  TimetableLang,
  Record<CohortId, { label: string; shortLabel: string }>
> = {
  ja: {
    Y1: { label: "1年次 (B1: 基礎課程)", shortLabel: "1年" },
    Y2: { label: "2年次 (B2: 専門基礎)", shortLabel: "2年" },
    Y3: { label: "3年次 (B3: 専門応用)", shortLabel: "3年" },
    Y4: { label: "4年次・院 (B4/M1: ゼミ・特論)", shortLabel: "4年・院" },
  },
  en: {
    Y1: { label: "Year 1 (B1: Foundation)", shortLabel: "Y1" },
    Y2: { label: "Year 2 (B2: Core CS)", shortLabel: "Y2" },
    Y3: { label: "Year 3 (B3: Advanced)", shortLabel: "Y3" },
    Y4: { label: "Year 4 / Grad (B4/M1: Seminar)", shortLabel: "Y4/Grad" },
  },
  zh: {
    Y1: { label: "大一 (B1: 基础课程)", shortLabel: "大一" },
    Y2: { label: "大二 (B2: 专业基础)", shortLabel: "大二" },
    Y3: { label: "大三 (B3: 专业进阶)", shortLabel: "大三" },
    Y4: { label: "大四/研一 (B4/M1: 研讨课)", shortLabel: "大四/研" },
  },
};

export const CATEGORY_I18N: Record<
  TimetableLang,
  Record<CourseCategory, { label: string; shortLabel: string; colorClass: string }>
> = {
  ja: {
    compulsory: { label: "必修講義", shortLabel: "必修", colorClass: "course-compulsory" },
    elective_core: { label: "選択必修", shortLabel: "選必", colorClass: "course-elective-core" },
    lab_exercise: { label: "PC演習・実験", shortLabel: "演習", colorClass: "course-lab" },
    elective: { label: "専門選択", shortLabel: "選択", colorClass: "course-elective" },
    seminar: { label: "少人数ゼミ", shortLabel: "ゼミ", colorClass: "course-seminar" },
  },
  en: {
    compulsory: { label: "Compulsory", shortLabel: "Comp", colorClass: "course-compulsory" },
    elective_core: { label: "Core Elec.", shortLabel: "Core", colorClass: "course-elective-core" },
    lab_exercise: { label: "PC Lab", shortLabel: "Lab", colorClass: "course-lab" },
    elective: { label: "Elective", shortLabel: "Elec", colorClass: "course-elective" },
    seminar: { label: "Seminar", shortLabel: "Sem", colorClass: "course-seminar" },
  },
  zh: {
    compulsory: { label: "必修理论课", shortLabel: "必修", colorClass: "course-compulsory" },
    elective_core: { label: "专业限选", shortLabel: "限选", colorClass: "course-elective-core" },
    lab_exercise: { label: "PC上机实验", shortLabel: "上机", colorClass: "course-lab" },
    elective: { label: "专业选修", shortLabel: "选修", colorClass: "course-elective" },
    seminar: { label: "小班研讨课", shortLabel: "研讨", colorClass: "course-seminar" },
  },
};

export const ROOM_TYPE_I18N: Record<TimetableLang, Record<RoomType, string>> = {
  ja: {
    large_hall: "大講義室",
    medium_room: "中講義室",
    pc_lab: "PC演習室",
    seminar_room: "ゼミ・演習室",
  },
  en: {
    large_hall: "Large Hall",
    medium_room: "Medium Room",
    pc_lab: "PC Lab",
    seminar_room: "Seminar Room",
  },
  zh: {
    large_hall: "大阶梯教室",
    medium_room: "中型教室",
    pc_lab: "PC机房",
    seminar_room: "研讨室",
  },
};

export const EQUIPMENT_I18N: Record<TimetableLang, Record<EquipmentTag, string>> = {
  ja: {
    projector: "プロジェクター",
    mic: "ワイヤレスマイク",
    pc_terminal: "演習用PC端末",
    recording: "講義収録設備",
    moveable_desks: "グループワーク可動机",
  },
  en: {
    projector: "Projector",
    mic: "Wireless Mic",
    pc_terminal: "PC Terminals",
    recording: "Lecture Capture",
    moveable_desks: "Modular Desks",
  },
  zh: {
    projector: "投影仪",
    mic: "无线麦克风",
    pc_terminal: "实验用PC终端",
    recording: "录播设备",
    moveable_desks: "可移动分组桌椅",
  },
};

export const ROOM_PROFILE_I18N: Record<
  string,
  Record<TimetableLang, { name: string; shortName: string; building: string }>
> = {
  R101: {
    ja: { name: "101大講義室", shortName: "101大", building: "情報棟1F" },
    en: { name: "Hall 101 (Large)", shortName: "101L", building: "CS Bldg 1F" },
    zh: { name: "101大阶梯教室", shortName: "101大", building: "信息楼1F" },
  },
  R102: {
    ja: { name: "102大講義室", shortName: "102大", building: "情報棟1F" },
    en: { name: "Hall 102 (Large)", shortName: "102L", building: "CS Bldg 1F" },
    zh: { name: "102大阶梯教室", shortName: "102大", building: "信息楼1F" },
  },
  R201: {
    ja: { name: "201中講義室", shortName: "201中", building: "情報棟2F" },
    en: { name: "Room 201 (Med)", shortName: "201M", building: "CS Bldg 2F" },
    zh: { name: "201中型教室", shortName: "201中", building: "信息楼2F" },
  },
  R202: {
    ja: { name: "202中講義室", shortName: "202中", building: "情報棟2F" },
    en: { name: "Room 202 (Med)", shortName: "202M", building: "CS Bldg 2F" },
    zh: { name: "202中型教室", shortName: "202中", building: "信息楼2F" },
  },
  R301: {
    ja: { name: "301 PC演習室A", shortName: "301PC-A", building: "情報棟3F" },
    en: { name: "301 PC Lab A", shortName: "301PC-A", building: "CS Bldg 3F" },
    zh: { name: "301 PC机房A", shortName: "301机房A", building: "信息楼3F" },
  },
  R302: {
    ja: { name: "302 PC演習室B", shortName: "302PC-B", building: "情報棟3F" },
    en: { name: "302 PC Lab B", shortName: "302PC-B", building: "CS Bldg 3F" },
    zh: { name: "302 PC机房B", shortName: "302机房B", building: "信息楼3F" },
  },
  R401: {
    ja: { name: "401ゼミ室", shortName: "401ゼミ", building: "情報棟4F" },
    en: { name: "401 Seminar Rm", shortName: "401Sem", building: "CS Bldg 4F" },
    zh: { name: "401研讨室", shortName: "401研讨", building: "信息楼4F" },
  },
};

export const PROFESSOR_PROFILE_I18N: Record<
  string,
  Record<TimetableLang, { name: string; shortName: string; title: string; specialty: string }>
> = {
  P01: {
    ja: {
      name: "佐藤 健一",
      shortName: "佐藤",
      title: "教授",
      specialty: "数理最適化・オペレーションズリサーチ",
    },
    en: {
      name: "Kenichi Sato",
      shortName: "Sato",
      title: "Prof.",
      specialty: "Mathematical Optimization & Operations Research",
    },
    zh: {
      name: "佐藤 健一",
      shortName: "佐藤",
      title: "教授",
      specialty: "数学规划・运筹学",
    },
  },
  P02: {
    ja: {
      name: "鈴木 美咲",
      shortName: "鈴木",
      title: "教授",
      specialty: "機械学習・自然言語処理",
    },
    en: {
      name: "Misaki Suzuki",
      shortName: "Suzuki",
      title: "Prof.",
      specialty: "Machine Learning & Natural Language Processing",
    },
    zh: {
      name: "铃木 美咲",
      shortName: "铃木",
      title: "教授",
      specialty: "机器学习・自然语言处理",
    },
  },
  P03: {
    ja: {
      name: "高橋 誠",
      shortName: "高橋",
      title: "教授",
      specialty: "アルゴリズム・離散数学",
    },
    en: {
      name: "Makoto Takahashi",
      shortName: "Takahashi",
      title: "Prof.",
      specialty: "Algorithms & Discrete Mathematics",
    },
    zh: {
      name: "高桥 诚",
      shortName: "高桥",
      title: "教授",
      specialty: "算法分析・离散数学",
    },
  },
  P04: {
    ja: {
      name: "田中 彩乃",
      shortName: "田中",
      title: "准教授",
      specialty: "ソフトウェア工学・プログラミング言語",
    },
    en: {
      name: "Ayano Tanaka",
      shortName: "Tanaka",
      title: "Assoc. Prof.",
      specialty: "Software Engineering & Programming Languages",
    },
    zh: {
      name: "田中 彩乃",
      shortName: "田中",
      title: "副教授",
      specialty: "软件工程・程序设计语言",
    },
  },
  P05: {
    ja: {
      name: "伊藤 大輔",
      shortName: "伊藤",
      title: "准教授",
      specialty: "データベース・分散システム",
    },
    en: {
      name: "Daisuke Ito",
      shortName: "Ito",
      title: "Assoc. Prof.",
      specialty: "Database & Distributed Systems",
    },
    zh: {
      name: "伊藤 大辅",
      shortName: "伊藤",
      title: "副教授",
      specialty: "数据库・分布式系统",
    },
  },
  P06: {
    ja: {
      name: "渡辺 結衣",
      shortName: "渡辺",
      title: "准教授",
      specialty: "統計科学・データマイニング",
    },
    en: {
      name: "Yui Watanabe",
      shortName: "Watanabe",
      title: "Assoc. Prof.",
      specialty: "Statistical Science & Data Mining",
    },
    zh: {
      name: "渡边 结衣",
      shortName: "渡边",
      title: "副教授",
      specialty: "统计科学・数据挖掘",
    },
  },
  P07: {
    ja: {
      name: "山本 翔太",
      shortName: "山本",
      title: "講師",
      specialty: "コンピュータシステム・OS・計算機科学基礎",
    },
    en: {
      name: "Shota Yamamoto",
      shortName: "Yamamoto",
      title: "Lecturer",
      specialty: "Computer Systems & Operating Systems",
    },
    zh: {
      name: "山本 翔太",
      shortName: "山本",
      title: "讲师",
      specialty: "计算机系统・操作系统基础",
    },
  },
  P08: {
    ja: {
      name: "中村 凛",
      shortName: "中村",
      title: "講師",
      specialty: "HCI・インタラクティブシステム・Web工学",
    },
    en: {
      name: "Rin Nakamura",
      shortName: "Nakamura",
      title: "Lecturer",
      specialty: "Human-Computer Interaction & Web Engineering",
    },
    zh: {
      name: "中村 凛",
      shortName: "中村",
      title: "讲师",
      specialty: "人机交互 (HCI)・Web工程",
    },
  },
  P09: {
    ja: {
      name: "小林 拓海",
      shortName: "小林",
      title: "非常勤講師",
      specialty: "情報セキュリティ・暗号理論（セキュリティ企業研究所長）",
    },
    en: {
      name: "Takumi Kobayashi",
      shortName: "Kobayashi",
      title: "Adjunct",
      specialty: "Cybersecurity & Cryptography (Industry Lab Director)",
    },
    zh: {
      name: "小林 拓海",
      shortName: "小林",
      title: "外聘讲师",
      specialty: "信息安全・密码学（安全企研所长）",
    },
  },
  P10: {
    ja: {
      name: "加藤 優奈",
      shortName: "加藤",
      title: "非常勤講師",
      specialty: "クラウドアーキテクチャ・情報倫理（テック企業VPoE）",
    },
    en: {
      name: "Yuna Kato",
      shortName: "Kato",
      title: "Adjunct",
      specialty: "Cloud Architecture & Tech Ethics (Industry VPoE)",
    },
    zh: {
      name: "加藤 优奈",
      shortName: "加藤",
      title: "外聘讲师",
      specialty: "云架构・信息伦理（科技企业VPoE）",
    },
  },
};

export const COURSE_PROFILE_I18N: Record<
  string,
  Record<TimetableLang, { title: string; shortTitle: string }>
> = {
  C01: {
    ja: { title: "情報科学概論", shortTitle: "情報科学概論" },
    en: { title: "Intro to Computer Science", shortTitle: "Intro CS" },
    zh: { title: "计算机科学导论", shortTitle: "计科导论" },
  },
  C02: {
    ja: { title: "線形代数学I", shortTitle: "線形代数I" },
    en: { title: "Linear Algebra I", shortTitle: "Linear Alg I" },
    zh: { title: "线性代数I", shortTitle: "线性代数I" },
  },
  C03: {
    ja: { title: "微分積分学I", shortTitle: "微積分I" },
    en: { title: "Calculus I", shortTitle: "Calculus I" },
    zh: { title: "微积分I", shortTitle: "微积分I" },
  },
  C04: {
    ja: { title: "離散数学基礎", shortTitle: "離散数学" },
    en: { title: "Discrete Mathematics", shortTitle: "Discrete Math" },
    zh: { title: "离散数学基础", shortTitle: "离散数学" },
  },
  C05: {
    ja: { title: "プログラミング入門演習A", shortTitle: "プロ入門A" },
    en: { title: "Intro Programming Lab A", shortTitle: "Prog Lab A" },
    zh: { title: "程序设计入门实验A", shortTitle: "编程实验A" },
  },
  C06: {
    ja: { title: "プログラミング入門演習B", shortTitle: "プロ入門B" },
    en: { title: "Intro Programming Lab B", shortTitle: "Prog Lab B" },
    zh: { title: "程序设计入门实验B", shortTitle: "编程实验B" },
  },
  C07: {
    ja: { title: "情報倫理と法制度", shortTitle: "情報倫理" },
    en: { title: "Information Ethics & Law", shortTitle: "Info Ethics" },
    zh: { title: "信息伦理与法规", shortTitle: "信息伦理" },
  },
  C08: {
    ja: { title: "アルゴリズムとデータ構造", shortTitle: "アルゴリズム" },
    en: { title: "Algorithms & Data Structures", shortTitle: "Algorithms" },
    zh: { title: "算法与数据结构", shortTitle: "算法结构" },
  },
  C09: {
    ja: { title: "確率・統計学", shortTitle: "確率・統計" },
    en: { title: "Probability & Statistics", shortTitle: "Prob & Stats" },
    zh: { title: "概率论与数理统计", shortTitle: "概率统计" },
  },
  C10: {
    ja: { title: "オペレーティングシステム", shortTitle: "OS" },
    en: { title: "Operating Systems", shortTitle: "OS" },
    zh: { title: "操作系统", shortTitle: "操作系统" },
  },
  C11: {
    ja: { title: "データベースシステム", shortTitle: "データベース" },
    en: { title: "Database Systems", shortTitle: "Databases" },
    zh: { title: "数据库系统", shortTitle: "数据库" },
  },
  C12: {
    ja: { title: "ソフトウェア設計演習", shortTitle: "SW設計演習" },
    en: { title: "Software Design Lab", shortTitle: "SW Design Lab" },
    zh: { title: "软件设计实验", shortTitle: "软件设计实验" },
  },
  C13: {
    ja: { title: "コンピュータネットワーク", shortTitle: "ネットワーク" },
    en: { title: "Computer Networks", shortTitle: "Networks" },
    zh: { title: "计算机网络", shortTitle: "计算机网络" },
  },
  C14: {
    ja: { title: "ヒューマンコンピュータインタラクション", shortTitle: "HCI" },
    en: { title: "Human-Computer Interaction", shortTitle: "HCI" },
    zh: { title: "人机交互技术", shortTitle: "HCI" },
  },
  C15: {
    ja: { title: "数理最適化", shortTitle: "数理最適化" },
    en: { title: "Mathematical Optimization", shortTitle: "Math Opt" },
    zh: { title: "数学规划与优化", shortTitle: "数学规划" },
  },
  C16: {
    ja: { title: "機械学習", shortTitle: "機械学習" },
    en: { title: "Machine Learning", shortTitle: "Machine Learn" },
    zh: { title: "机器学习", shortTitle: "机器学习" },
  },
  C17: {
    ja: { title: "自然言語処理", shortTitle: "自然言語処理" },
    en: { title: "Natural Language Processing", shortTitle: "NLP" },
    zh: { title: "自然语言处理", shortTitle: "自然语言处理" },
  },
  C18: {
    ja: { title: "情報セキュリティ", shortTitle: "セキュリティ" },
    en: { title: "Information Security", shortTitle: "Info Security" },
    zh: { title: "信息安全", shortTitle: "信息安全" },
  },
  C19: {
    ja: { title: "データサイエンス実践演習", shortTitle: "DS実践演習" },
    en: { title: "Applied Data Science Lab", shortTitle: "DS Lab" },
    zh: { title: "数据科学实践实验", shortTitle: "数据科学实验" },
  },
  C20: {
    ja: { title: "Webアプリケーション開発演習", shortTitle: "Web開発演習" },
    en: { title: "Web App Development Lab", shortTitle: "Web Dev Lab" },
    zh: { title: "Web应用开发实验", shortTitle: "Web开发实验" },
  },
  C21: {
    ja: { title: "クラウドコンピューティング実践", shortTitle: "クラウド実践" },
    en: { title: "Cloud Computing Practice", shortTitle: "Cloud Comp" },
    zh: { title: "云计算实践", shortTitle: "云计算实践" },
  },
  C22: {
    ja: { title: "暗号理論とブロックチェーン", shortTitle: "暗号理論" },
    en: { title: "Cryptography & Blockchain", shortTitle: "Cryptography" },
    zh: { title: "密码学与区块链", shortTitle: "密码学" },
  },
  C23: {
    ja: { title: "数理最適化ゼミ", shortTitle: "最適化ゼミ" },
    en: { title: "Optimization Seminar", shortTitle: "Opt Seminar" },
    zh: { title: "数学规划研讨课", shortTitle: "优化研讨课" },
  },
  C24: {
    ja: { title: "人工知能・NLPゼミ", shortTitle: "AI・NLPゼミ" },
    en: { title: "AI & NLP Seminar", shortTitle: "AI Seminar" },
    zh: { title: "人工智能与NLP研讨课", shortTitle: "AI研讨课" },
  },
  C25: {
    ja: { title: "システムソフトウェア輪講", shortTitle: "システム輪講" },
    en: { title: "Systems Software Colloquium", shortTitle: "Systems Sem" },
    zh: { title: "系统软件文献研讨", shortTitle: "系统研讨课" },
  },
};

export function getRoomI18n(room: RoomProfile, lang: TimetableLang) {
  return (
    ROOM_PROFILE_I18N[room.id]?.[lang] ?? {
      name: room.name,
      shortName: room.shortName,
      building: room.building,
    }
  );
}

export function getProfessorI18n(prof: ProfessorProfile, lang: TimetableLang) {
  return (
    PROFESSOR_PROFILE_I18N[prof.id]?.[lang] ?? {
      name: prof.name,
      shortName: prof.name.split(" ")[0],
      title: prof.title,
      specialty: prof.specialty,
    }
  );
}

export function getCourseI18n(course: CourseProfile, lang: TimetableLang) {
  return (
    COURSE_PROFILE_I18N[course.id]?.[lang] ?? {
      title: course.title,
      shortTitle: course.shortTitle,
    }
  );
}

export function formatSlotReasonI18n(reason: string | undefined, lang: TimetableLang): string {
  if (!reason || lang === "ja") return reason ?? "";
  const map: Record<string, { en: string; zh: string }> = {
    "学部長・教授会定例": { en: "Faculty Meeting", zh: "院务与教授例会" },
    "教授会定例": { en: "Faculty Meeting", zh: "教授例会" },
    "共同研究定例ミーティング": { en: "Joint Research Sync", zh: "联合研究例会" },
    "保育園お迎え": { en: "Childcare Pickup", zh: "托儿所接送" },
    "全学情報基盤委員会": { en: "IT Infrastructure Committee", zh: "全校信息基础设施委员会" },
    "通院・定期健診枠": { en: "Medical Appointment", zh: "定期体检与门诊" },
    "本社業務のため午後または2限以降希望": {
      en: "HQ Duty (P2+ Preferred)",
      zh: "总部公务（仅第2节后可排）",
    },
    "移動時間確保のため1限不可": { en: "Commute Time (No P1)", zh: "通勤时间（第1节不可）" },
    "出講可能枠外(チャット設定)": { en: "Outside Available Window", zh: "可出勤时段外(对话设定)" },
    "チャットNG指定": { en: "Chat NG Slot", zh: "对话指定禁排" },
  };
  return map[reason]?.[lang] ?? reason;
}

export function formatCustomRuleI18n(
  rule: CustomTimetableRule,
  state: TimetableState,
  lang: TimetableLang
): string {
  if (lang === "ja") return rule.description;

  const courseMap = new Map(state.courses.map((c) => [c.id, c]));
  const roomMap = new Map(state.rooms.map((r) => [r.id, r]));
  const profMap = new Map(state.professors.map((p) => [p.id, p]));

  const c1 = rule.courseId ? courseMap.get(rule.courseId) : undefined;
  const c2 = rule.secondCourseId ? courseMap.get(rule.secondCourseId) : undefined;
  const r = rule.roomId ? roomMap.get(rule.roomId) : undefined;
  const p = rule.professorId ? profMap.get(rule.professorId) : undefined;

  const c1Name = c1 ? `${getCourseI18n(c1, lang).title} (${c1.id})` : (rule.courseId ?? "");
  const c1Short = c1 ? `${getCourseI18n(c1, lang).shortTitle} (${c1.id})` : (rule.courseId ?? "");
  const c2Short = c2 ? `${getCourseI18n(c2, lang).shortTitle} (${c2.id})` : (rule.secondCourseId ?? "");
  const rName = r ? `${getRoomI18n(r, lang).name} (${r.id})` : "";
  const pName = p ? `${getProfessorI18n(p, lang).name} (${p.id})` : "";

  const isDemo = rule.id.startsWith("conflict_demo_");
  const demoPrefix = isDemo ? (lang === "en" ? "[Conflict Demo] " : "【冲突演示】") : "";

  if (rule.kind === "pin_slot" && rule.days?.length && rule.periods?.length) {
    const slotStr =
      rule.days.length === 1 && rule.periods.length === 1
        ? formatSlotI18n(rule.days[0], rule.periods[0], lang)
        : `${rule.days.map((d) => DAY_SHORT_I18n(d, lang)).join("/")} ${rule.periods.map((pr) => formatPeriodI18n(pr, lang)).join("/")}`;
    if (lang === "en") {
      return `${demoPrefix}Pin "${c1Name}" to ${slotStr}${rName ? ` in ${rName}` : ""}`;
    }
    return `${demoPrefix}将《${c1Name}》固定在 ${slotStr}${rName ? `・${rName}` : ""}`;
  }

  if (rule.kind === "forbid_slot") {
    const daysStr = (rule.days ?? DAYS_OF_WEEK).map((d) => DAY_SHORT_I18n(d, lang)).join("/");
    const periodsStr =
      !rule.periods || rule.periods.length === 5
        ? lang === "en"
          ? "All Day"
          : "全天"
        : rule.periods.map((pr) => formatPeriodI18n(pr, lang)).join("/");
    if (lang === "en") {
      return `Forbid "${c1Name || pName}" on ${daysStr} (${periodsStr})`;
    }
    return `禁止《${c1Name || pName}》排在 ${daysStr} (${periodsStr})`;
  }

  if (rule.kind === "require_room" || rule.kind === "forbid_room") {
    const target = rName || (rule.roomType ? ROOM_TYPE_I18N[lang][rule.roomType] : "");
    if (lang === "en") {
      return rule.kind === "require_room"
        ? `Require room ${target} for "${c1Name}"`
        : `Forbid room ${target} for "${c1Name}"`;
    }
    return rule.kind === "require_room"
      ? `限定《${c1Name}》使用 ${target}`
      : `禁止《${c1Name}》使用 ${target}`;
  }

  if (rule.kind === "course_no_overlap") {
    return lang === "en"
      ? `No Time Overlap: Do not schedule "${c1Short}" and "${c2Short}" in the same slot`
      : `禁止同时段冲突: 《${c1Short}》与《${c2Short}》不得排在同一时段`;
  }

  if (rule.kind === "course_consecutive") {
    return lang === "en"
      ? `Consecutive Periods: Schedule "${c1Short}"${c2 ? ` & "${c2Short}"` : ""} in adjacent periods on the same day`
      : `同日连排指定: 将《${c1Short}》${c2 ? `与《${c2Short}》` : "的2节课"}排在同一天的相邻连续节次`;
  }

  if (rule.kind === "course_same_day") {
    return lang === "en"
      ? `Same-Day Sessions: Schedule "${c1Short}"${c2 ? ` & "${c2Short}"` : ""} on the same day`
      : `同日开课指定: 将《${c1Short}》${c2 ? `与《${c2Short}》` : ""}排在同一天`;
  }

  if (rule.kind === "course_precedence") {
    return lang === "en"
      ? `Curriculum Order: Schedule "${c1Short}" on the same day or an earlier day than "${c2Short}"`
      : `教学顺序约束: 《${c1Short}》必须排在《${c2Short}》之前（或同一天）`;
  }

  if (rule.kind === "room_closure") {
    const daysStr = (rule.days ?? DAYS_OF_WEEK).map((d) => DAY_SHORT_I18n(d, lang)).join("/");
    const periodsStr = (rule.periods ?? []).map((pr) => formatPeriodI18n(pr, lang)).join("/");
    return lang === "en"
      ? `Room Closure: ${rName} unavailable on ${daysStr} ${periodsStr}`
      : `教室关闭维护: ${rName} 于 ${daysStr} ${periodsStr} 停用`;
  }

  return rule.description;
}

function DAY_SHORT_I18n(d: TimetableDay, lang: TimetableLang): string {
  return DAY_SHORT_I18N[lang][d];
}

export function formatConstraintMetaI18n(
  meta: ConstraintMeta,
  state: TimetableState,
  lang: TimetableLang
): { label: string; suggestion?: string } {
  if (lang === "ja") {
    return { label: meta.labelJa, suggestion: meta.relaxSuggestion };
  }

  const courseMap = new Map(state.courses.map((c) => [c.id, c]));
  const roomMap = new Map(state.rooms.map((r) => [r.id, r]));
  const profMap = new Map(state.professors.map((p) => [p.id, p]));

  // Custom rule constraints: custom_pin_..., custom_forbid_..., etc.
  if (meta.category === "custom" && meta.relatedRuleId) {
    const rule = state.customRules.find((r) => r.id === meta.relatedRuleId);
    if (rule) {
      const desc = formatCustomRuleI18n(rule, state, lang);
      return {
        label: lang === "en" ? `Custom Rule: ${desc}` : `自定义规则: ${desc}`,
        suggestion:
          lang === "en"
            ? `Disable or modify custom rule "${desc}".`
            : `请解除或修改自定义规则「${desc}」。`,
      };
    }
  }

  if (meta.name.startsWith("prof_unavail_day_")) {
    const parts = meta.name.split("_");
    const profId = parts[3];
    const day = parts[4] as TimetableDay;
    const prof = profMap.get(profId);
    const pI18n = prof ? getProfessorI18n(prof, lang) : null;
    const availDays = prof
      ? DAYS_OF_WEEK.filter((d) => !prof.unavailableDays.includes(d))
          .map((d) => DAY_SHORT_I18N[lang][d])
          .join("/")
      : "";
    return {
      label:
        lang === "en"
          ? `Faculty Unavailable Day: ${pI18n?.name ?? profId} (${pI18n?.title ?? ""}) cannot teach on ${DAY_FULL_I18N.en[day]} (Available: ${availDays})`
          : `教师不可出勤日: ${pI18n?.name ?? profId} (${pI18n?.title ?? ""}) 无法在${DAY_FULL_I18N.zh[day]}出勤（可排日: ${availDays}）`,
      suggestion:
        lang === "en"
          ? `Schedule ${pI18n?.shortName ?? profId}'s courses on ${availDays}, or update their available days.`
          : `请将 ${pI18n?.name ?? profId} 负责的课程排在 ${availDays}，或调整其可出勤日设定。`,
    };
  }

  if (meta.name.startsWith("room_excl_")) {
    const parts = meta.name.split("_");
    const roomId = parts[2];
    const day = parts[3] as TimetableDay;
    const period = Number(parts[4]?.replace("P", "")) as TimetablePeriod;
    const room = roomMap.get(roomId);
    const rI18n = room ? getRoomI18n(room, lang) : null;
    const slot = formatSlotI18n(day, period, lang);
    return {
      label:
        lang === "en"
          ? `Room Exclusivity: ${rI18n?.name ?? roomId} (${roomId}) can host at most 1 course at ${slot}`
          : `教室独占约束: ${rI18n?.name ?? roomId} (${roomId}) 在 ${slot} 最多只能安排1门课程`,
      suggestion:
        lang === "en"
          ? `Check if multiple courses are pinned to ${rI18n?.name ?? roomId} at ${slot}.`
          : `请检查是否将多门课程同时固定在了 ${slot} 的 ${rI18n?.name ?? roomId}。`,
    };
  }

  if (meta.name.startsWith("room_compat_")) {
    const courseId = meta.name.replace("room_compat_", "");
    const c = courseMap.get(courseId);
    const cI18n = c ? getCourseI18n(c, lang) : null;
    return {
      label:
        lang === "en"
          ? `Room Capacity & Equipment: "${cI18n?.title ?? courseId} (${courseId}, ${c?.enrollment ?? 0} students)" requires a compatible room`
          : `教室容量与设备限制: 《${cI18n?.title ?? courseId} (${courseId}・${c?.enrollment ?? 0}人)》仅能在容量及设备匹配的教室开课`,
      suggestion:
        lang === "en"
          ? `Assign "${cI18n?.title ?? courseId}" to a room with sufficient capacity/PCs.`
          : `请为《${cI18n?.title ?? courseId}》指定满足容量或PC机房要求的教室。`,
    };
  }

  if (meta.name.startsWith("course_sessions_")) {
    const courseId = meta.name.replace("course_sessions_", "");
    const c = courseMap.get(courseId);
    const cI18n = c ? getCourseI18n(c, lang) : null;
    return {
      label:
        lang === "en"
          ? `Weekly Required Sessions: "${cI18n?.title ?? courseId} (${courseId})" requires ${c?.sessionsPerWeek ?? 1} session(s)/week`
          : `每周必需课时: 《${cI18n?.title ?? courseId} (${courseId})》每周需安排 ${c?.sessionsPerWeek ?? 1} 节课`,
      suggestion:
        lang === "en"
          ? `Check pinned/forbidden rules and compatible room availability for "${cI18n?.title ?? courseId}".`
          : `请检查《${cI18n?.title ?? courseId}》的固定/禁排规则及可用教室。`,
    };
  }

  if (meta.name.startsWith("cohort_excl_") || meta.name.startsWith("cohort_lab_excl_")) {
    const parts = meta.name.split("_");
    const cohortId = (parts[2] === "excl" ? parts[3] : parts[2]) as CohortId;
    const cohortLabel = COHORT_I18N[lang][cohortId]?.shortLabel ?? cohortId;
    return {
      label:
        lang === "en"
          ? `Cohort Curriculum No-Overlap: Compulsory/core courses for ${cohortLabel} cannot overlap in the same slot`
          : `年级必修课互斥: ${cohortLabel}的必修与核心课程不得排在同一时段`,
      suggestion:
        lang === "en"
          ? `Move one of the overlapping ${cohortLabel} courses to another period.`
          : `请将发生重叠的${cohortLabel}必修/实验课移至其他时段。`,
    };
  }

  return { label: meta.labelJa, suggestion: meta.relaxSuggestion };
}

export interface TimetableUiStrings {
  pageTitle: string;
  headerTitle: string;
  btnTutorial: string;
  btnTheory: string;
  navApps: string;
  navAiShift: string;
  themeToggleTitle: string;

  chatPaneAria: string;
  chatHeaderTitle: string;
  trajectoryBtnTitle: string;
  nanoChecking: string;
  nanoReady: string;
  nanoDownloading: string;
  nanoDownloadable: string;
  nanoUnavailableBadge: string;
  nanoSetupBtnTitle: string;
  nanoUnavailBannerText: string;
  nanoSetupLink: string;
  nanoRetryLink: string;
  chatLogAria: string;
  chatSenderUser: string;
  chatSenderAssistant: string;
  chatSenderSystem: string;
  chatWelcomeMarkdown: string;

  popoverHeader: string;
  promptChips: Array<{ label: string; prompt: string }>;
  chatInputLabel: string;
  chatPlaceholder: string;
  btnExamples: string;
  autoSolveLabel: string;
  autoSolveTitle: string;
  btnChatAbort: string;
  btnChatSend: string;

  tutorialTitle: string;
  tutorialClose: string;
  step1Badge: string;
  step1Title: string;
  step1DescHtml: string;
  step1Btn: string;
  step2Badge: string;
  step2Title: string;
  step2DescHtml: string;
  step2Btn: string;
  step3Badge: string;
  step3Title: string;
  step3DescHtml: string;
  step3SelectAria: string;
  step3Opt1: string;
  step3Opt2: string;
  step3Opt3: string;
  step3Btn: string;

  statusPreparing: string;
  statusSolving: string;
  statusOptimal: string;
  statusFeasible: string;
  statusInfeasible: string;
  statusError: string;
  btnAbortSolve: string;
  btnSolveWashi: string;
  btnCheckCurrent: string;
  btnCheckCurrentTitle: string;
  btnResetClean: string;
  btnResetCleanTitle: string;

  conflictBannerTitle: string;
  btnClearConflicts: string;
  btnAskAiConflict: string;
  conflictAskPrompt: string;

  tabTimetable: string;
  tabConstraints: string;
  tabCatalog: string;

  viewCohortsBtn: string;
  viewProfsBtn: string;
  viewRoomsBtn: string;
  legendPinned: string;
  legendChanged: string;
  preserveToggleLabel: string;
  preserveToggleTitle: string;
  diffToggleLabel: string;
  diffToggleTitle: string;

  crossBarLabel: string;
  crossBarAll: string;
  adjunctSuffix: string;
  periodColHeader: string;
  pinEmptySlotBtn: string;
  matrixProfCorner: string;
  matrixRoomCorner: string;
  matrixProfStatCol: string;
  matrixRoomStatCol: string;
  matrixUnavailDay: string;
  matrixUnavailSlot: string;
  matrixClosedSlot: string;
  matrixFooterLabel: string;

  customRulesTitle: string;
  customRulesDesc: string;
  customRulesEmpty: string;
  btnApplyConfigSolve: string;
  btnResetDefaultConfig: string;
  tagHardRule: string;
  tagSoftRule: string;
  btnSwitchToSoft: string;
  btnSwitchToHard: string;
  btnDeleteRule: string;

  newRuleKindLabel: string;
  newRuleKindPin: string;
  newRuleKindForbid: string;
  newRuleKindNoOverlap: string;
  newRuleKindConsec: string;
  newRuleKindSameDay: string;
  newRuleCourse1Label: string;
  newRuleCourse2Label: string;
  newRuleDayLabel: string;
  newRulePeriodLabel: string;
  newRuleRoomLabel: string;
  autoAssignRoomOpt: string;
  btnAddCustomRule: string;

  card1Title: string;
  card1Desc: string;
  cfgRoomCapHtml: string;
  cfgRoomEquipHtml: string;
  cfgCohortNoOverlapHtml: string;
  cfgForbidSameDayHtml: string;

  card2Title: string;
  card2Desc: string;
  cfgAdjunctDaysHtml: string;
  cfgProfAvailHtml: string;
  cfgMaxConsecHtml: string;
  cfgNumMaxConsec: string;
  cfgNumMaxDaily: string;
  cfgNumMaxCohortDaily: string;
  cfgNumWeightGap: string;

  devInspectorSummary: string;
  btnDiagnoseSingle: string;

  catProfTitle: string;
  catProfDesc: string;
  catProfHeaders: [string, string, string, string, string, string, string];
  catRoomTitle: string;
  catRoomHeaders: [string, string, string, string, string, string];
  catCourseTitle: string;
  catCourseHeaders: [string, string, string, string, string, string, string];

  slotDialogTitle: string;
  slotDialogPinBtn: string;
  slotDialogForbidBtn: string;
  slotDialogClearBtn: string;
  dialogCloseLabel: string;

  nanoDialogTitle: string;
  nanoDialogIntroHtml: string;
  nanoDialogStep1Html: string;
  nanoDialogStep2Html: string;
  nanoDialogStep3Html: string;
  nanoDialogNote: string;
  nanoDialogRecheckBtn: string;
  nanoDialogCloseBtn: string;

  trajDialogTitle: string;
  trajDialogDesc: string;
  trajCopyBtn: string;
  trajDownloadBtn: string;
  trajClearBtn: string;

  promptCatalogBtn: string;
  promptCatalogTitle: string;
  promptCatalogIntro: string;
  promptCatalogCloseBtn: string;
  promptCatalogCategories: Array<{
    title: string;
    items: Array<{ label: string; desc: string; prompt: string }>;
  }>;

  catMgmtBadge: string;
  catMgmtTitle: string;
  catMgmtDesc: string;
  btnCatGenerate: string;
  btnCatImportCsv: string;
  btnCatDownloadSamples: string;
  btnCatClearBlank: string;
  catEmptyTitle: string;
  catEmptyDesc: string;
  catEmptyGenMain: string;
  catEmptyGenSub: string;
  catEmptyImportMain: string;
  catEmptyImportSub: string;
  catEmptySamplesBtn: string;
}

export const UI_TEXT_I18N: Record<TimetableLang, TimetableUiStrings> = {
  ja: {
    pageTitle: "大学時間割編成 AI Copilot — Gemini Nano × WaSHI",
    headerTitle: "🎓 大学時間割編成 AI Copilot (UCTP)",
    btnTutorial: "🔰 使い方ガイド",
    btnTheory: "📖 解説記事",
    navApps: "← Apps",
    navAiShift: "🏥 AI Shift",
    themeToggleTitle: "ライト/ダークモード切替",

    chatPaneAria: "AI時間割相談チャットスペース",
    chatHeaderTitle: "AI 教務・時間割相談",
    trajectoryBtnTitle: "AIプロンプト・JSON出力・WaSHI求解ログ(Trajectory)の確認・コピー・JSON保存",
    nanoChecking: "⏳ 確認中",
    nanoReady: "🟢 Gemini Nano Ready",
    nanoDownloading: "⏬ DL中...",
    nanoDownloadable: "🟡 Gemini Nano DL可能",
    nanoUnavailableBadge: "⚪ 内蔵AI 未有効",
    nanoSetupBtnTitle: "Chrome Built-in AI (Gemini Nano) の設定手順",
    nanoUnavailBannerText: "⚠️ Chrome 内蔵 AI (Gemini Nano) が未有効です",
    nanoSetupLink: "設定手順",
    nanoRetryLink: "再確認",
    chatLogAria: "チャット履歴",
    chatSenderUser: "👤 あなた (教務担当)",
    chatSenderAssistant: "🤖 時間割編成 AI Copilot",
    chatSenderSystem: "ℹ️ システム",
    chatWelcomeMarkdown:
      "👋 **大学時間割編成 AI Copilot (UCTP) へようこそ！**\n\n" +
      "現在は**白紙モード**です。時間割を作成するには、まず以下のいずれかでデータを準備してください：\n" +
      "1. **「✨ サンプル生成」**: 教員10名・教室7室・25科目の典型的な工学部データを基礎台帳にセットします。\n" +
      "2. **「📂 CSV読込」**: お手元の教員・教室・科目のCSVファイルを読み込みます（サンプルCSVもダウンロード可能）。\n\n" +
      "基礎データ確認後、**「📅 時間割ボード」**で**「⚡ 時間割を自動編成」**を押すと、WaSHI (HiGHS) が制約を満たす最適なコマ配置を一括探索します。\n" +
      "編成後は「数理最適化を火曜2限に固定して」「小林先生は火曜・木曜午後のみ」などの自然言語指示による条件調整も可能です。入力欄下の **「📖 プロンプト集」** から全8カテゴリの想定質問・指示例をご確認いただけます！",

    popoverHeader: "💡 クリックして入力欄にセット（教務・教員要望例）",
    promptChips: [
      {
        label: "📌 数理最適化(C15)を火曜2限・101大講義室に固定する",
        prompt: "数理最適化(C15)を火曜2限の101大講義室(R101)に固定して、時間割を再最適化して",
      },
      {
        label: "🕒 非常勤の小林先生を火・木の午後(3〜5限)のみ可能にする",
        prompt: "非常勤の小林先生(P09)は火曜と木曜の午後(3〜5限)しか来られないように設定して",
      },
      {
        label: "🚫 機械学習(C16)と自然言語処理(C17)の裏番組(重複)を禁止する",
        prompt: "機械学習(C16)と自然言語処理(C17)は両方履修する学生が多いので、同じ曜日・時限に被せないで",
      },
      {
        label: "🔗 ソフトウェア設計演習(C12)の2コマを同日連続時限にする",
        prompt: "ソフトウェア設計演習(C12)の週2コマは、同じ曜日の連続する時限(2コマ連続)にまとめて開講して",
      },
      {
        label: "📅 佐藤先生の金曜午後(3〜5限)を出講NGにする",
        prompt: "佐藤先生(P01)は金曜日の午後(3〜5限)を学会・研究打ち合わせのため出講不可(NG)にして",
      },
      {
        label: "🛠️ 301 PC演習室Aを木曜午後にメンテ閉鎖する",
        prompt: "301 PC演習室A(R301)は木曜日の午後(3〜5限)にネットワーク機器メンテナンスで閉鎖して",
      },
      {
        label: "⚖️ 教員の連続講義を禁止(最大1コマ連続)に変更する",
        prompt: "教員の連続講義上限を2コマ連続から1コマ（連続講義なし）に変更して組み直して",
      },
      {
        label: "💥 非常勤講師の出講不可曜日に授業を固定して矛盾診断する",
        prompt: "火曜・木曜しか来られない非常勤の小林先生の情報セキュリティ(C18)を月曜3限に固定するとどうなるか矛盾診断して",
      },
    ],
    chatInputLabel: "AIへの時間割相談メッセージ",
    chatPlaceholder:
      "時間割の要望や条件変更を入力（例: 「数理最適化を火曜2限に固定して」「小林先生は火木の午後のみに」）",
    btnExamples: "💡 要望例",
    autoSolveLabel: "自動再計算",
    autoSolveTitle: "条件変更時に自動で最適化を実行します",
    btnChatAbort: "⏹ 停止",
    btnChatSend: "送信",

    tutorialTitle: "🔰 クイックガイド：3ステップで体験するAI大学時間割編成 (UCTP)",
    tutorialClose: "✕ 閉じる",
    step1Badge: "STEP 1",
    step1Title: "基礎データを確認・読み込む",
    step1DescHtml:
      "まずは教員・教室・科目のマスタデータを登録します。「🎲 サンプル生成」または「📂 CSV読込」で準備できます（表内のセル直接編集も可能）。",
    step1Btn: "🎲 試す：サンプルデータを読み込む",
    step2Badge: "STEP 2",
    step2Title: "条件設定やAI相談で調整",
    step2DescHtml:
      "「⚙️ 条件・ルール設定」タブやチャット欄で、出講枠・連続コマ・PC演習室などの現場ルールを追加・調整できます。",
    step2Btn: "🔗 試す：「SW設計演習(週2コマ)」を同日連続時限に指定",
    step3Badge: "STEP 3",
    step3Title: "時間割の自動編成・調整・矛盾診断",
    step3DescHtml:
      "「⚡ 時間割を自動編成」で4学年・教員・教室を一括最適化。コマをドラッグ移動したり、衝突原因の自動診断(IIS)を体験できます。",
    step3SelectAria: "わざと追加する矛盾シナリオ",
    step3Opt1: "デモ例1: 非常勤(火・木のみ)の小林先生の科目を月曜3限に強制固定",
    step3Opt2: "デモ例2: 130名超の1年必修2科目を両方「火曜2限・101大講義室」に固定",
    step3Opt3: "デモ例3: PC演習室が2室しかないのにPC必須3科目を「月曜2限」に同時固定",
    step3Btn: "💥 試す：わざと矛盾ルールを追加して診断する",

    statusPreparing: "準備中",
    statusSolving: "⏳ 計算中...",
    statusOptimal: "✅ Optimal (最適解)",
    statusFeasible: "✅ Feasible (実行可能解)",
    statusInfeasible: "🚨 解なし (Infeasible)",
    statusError: "⚠️ エラー",
    btnAbortSolve: "⏹ 計算を中断",
    btnSolveWashi: "⚡ 時間割を再最適化",
    btnCheckCurrent: "🔍 矛盾・整合性チェック",
    btnCheckCurrentTitle: "現在の時間割制約条件に矛盾がないかチェックします",
    btnResetClean: "↩ リセット",
    btnResetCleanTitle: "追加した固定ルールや矛盾シナリオをリセットして初期状態に戻します",

    conflictBannerTitle: "🚨 時間割を組めません — WaSHI (HiGHS) が特定した衝突ルール",
    btnClearConflicts: "✨ 衝突している追加ルールを解除して解決",
    btnAskAiConflict: "🤖 AIに解決策を聞く",
    conflictAskPrompt: "現在の時間割が組めない原因と、どの条件を緩めればよいか教えて",

    tabTimetable: "📅 時間割ボード (4学年 × 10教員 × 7教室)",
    tabConstraints: "⚙️ 条件・ルール設定",
    tabCatalog: "📚 基礎データ (教員・教室・科目)",

    viewCohortsBtn: "🎓 学年別 4枚同時表示 (1年〜4年)",
    viewProfsBtn: "👨‍🏫 教員別 × 25コマ一覧表 (10名)",
    viewRoomsBtn: "🏫 教室別 × 25コマ一覧表 (7室)",
    legendPinned: "固定中",
    legendChanged: "前回から変更",
    preserveToggleLabel: "🔒 微調整モード",
    preserveToggleTitle: "ONのとき、再最適化時に現在の時間割からの変更コマ数を最小化します",
    diffToggleLabel: "✨ 変更箇所を表示",
    diffToggleTitle: "前回の時間割から変更された科目カードをオレンジ枠でハイライト表示します",

    crossBarLabel: "🔗 横断連動チェック (ホバー/クリックで4枚の時間割を横断ハイライト):",
    crossBarAll: "全表示",
    adjunctSuffix: "(非)",
    periodColHeader: "時限",
    pinEmptySlotBtn: "＋固定",
    matrixProfCorner: "教員名 (職位・出講条件)",
    matrixRoomCorner: "講義室・演習室 (定員・種別)",
    matrixProfStatCol: "週コマ / 最大連続",
    matrixRoomStatCol: "稼働数 / 稼働率",
    matrixUnavailDay: "不可",
    matrixUnavailSlot: "NG",
    matrixClosedSlot: "閉鎖",
    matrixFooterLabel: "同時開講コマ数 (全7室中)",

    customRulesTitle: "📌 個別に追加・固定された時間割ルール",
    customRulesDesc:
      "時間割ボードのクリックやAIチャット、または下のフォームから追加された個別制約です。チェックボックスでON/OFF、ハード/ソフトの切り替えや削除ができます。",
    customRulesEmpty: "現在、個別に追加されたカスタムルールはありません。",
    btnApplyConfigSolve: "⚡ 設定変更を反映して再計算",
    btnResetDefaultConfig: "↩ 初期設定に戻す",
    tagHardRule: "🔒 ハード必須",
    tagSoftRule: "⚖️ ソフト希望",
    btnSwitchToSoft: "ソフトに変更",
    btnSwitchToHard: "ハードに変更",
    btnDeleteRule: "削除",

    newRuleKindLabel: "追加するルール種別",
    newRuleKindPin: "📌 科目の曜日・時限固定",
    newRuleKindForbid: "🚫 科目の曜日・時限禁止",
    newRuleKindNoOverlap: "⚡ 2科目の同時開講禁止",
    newRuleKindConsec: "🔗 週2コマ科目の連続時限指定",
    newRuleKindSameDay: "📅 2コマ/2科目の同日開講指定",
    newRuleCourse1Label: "対象科目A",
    newRuleCourse2Label: "対象科目B (2科目ルール用)",
    newRuleDayLabel: "曜日",
    newRulePeriodLabel: "時限",
    newRuleRoomLabel: "教室指定(任意)",
    autoAssignRoomOpt: "自動割当 (定員・設備適合教室)",
    btnAddCustomRule: "＋ ルールを追加",

    card1Title: "🏛️ 1. 教室定員・設備 ＆ 学年カリキュラム基本制約",
    card1Desc: "大学時間割編成(UCTP)における物理的・教務的ハード制約の有効/無効を設定します。",
    cfgRoomCapHtml: "<strong>教室定員の厳守</strong>（履修者数が教室定員を超える割当を禁止）",
    cfgRoomEquipHtml:
      "<strong>教室設備・PC演習室要件の厳守</strong>（プログラミング・DS演習はPC演習室必須等）",
    cfgCohortNoOverlapHtml:
      "<strong>学年別の必修・選択必修カリキュラム重複禁止</strong>（同一学年の必修同士・演習との重複を禁止）",
    cfgForbidSameDayHtml:
      "<strong>週2コマ科目の同日開講防止</strong>（個別指定がない限り週2コマ科目は別々の曜日に分散配置）",

    card2Title: "👨‍🏫 2. 教員の出講可能枠・連続講義上限・学生空きコマ抑制",
    card2Desc:
      "専任・非常勤講師の出講不可枠の遵守、連続講義上限、および目的関数のソフトペナルティ重みを設定します。",
    cfgAdjunctDaysHtml:
      "<strong>非常勤講師の出講可能曜日を厳守</strong>（小林先生:火木のみ / 加藤先生:水金のみ）",
    cfgProfAvailHtml: "<strong>教員の都合NG枠（教授会・委員会・通院等）を厳守</strong>",
    cfgMaxConsecutiveHtml: "<strong>教員の連続講義コマ数上限を厳守する</strong>",
    cfgMaxConsecHtml: "<strong>教員の連続講義コマ数上限を厳守する</strong>",
    cfgNumMaxConsec: "教員 最大連続講義数",
    cfgNumMaxDaily: "教員 1日最大担当コマ数",
    cfgNumMaxCohortDaily: "学年 1日最大必修コマ数",
    cfgNumWeightGap: "学生の空きコマ(中空き)ペナルティ重み",

    devInspectorSummary: "💻 開発者向け: WaSHI 数理モデルコード ＆ LPプレビューを表示",
    btnDiagnoseSingle: "🔍 WaSHI (HiGHS) で現在の制約の論理整合性を単体チェック",

    catProfTitle: "👨‍🏫 教員一覧 ＆ 出講条件・割当コマ集計 (10名)",
    catProfDesc:
      "各教員の出講不可曜日・NG時限・1限/5限回避希望、および現在の時間割における割当結果です。",
    catProfHeaders: [
      "ID",
      "教員氏名",
      "職位・区分",
      "専門分野",
      "出講不可曜日・NG枠",
      "時間帯希望・上限",
      "現在の割当実績",
    ],
    catRoomTitle: "🏫 講義室・演習室一覧 ＆ 設備・稼働率 (7室)",
    catRoomHeaders: ["ID", "教室名", "種別・場所", "定員", "備付設備", "週間稼働率 (25枠中)"],
    catCourseTitle: "📚 開講科目一覧 (全25科目・計30コマ)",
    catCourseHeaders: [
      "ID",
      "科目名",
      "対象学年・区分",
      "担当教員",
      "履修者数・週コマ数",
      "必須設備・教室条件",
      "現在の割当枠・教室",
    ],

    slotDialogTitle: "時間割コマの固定・移動・禁止設定",
    slotDialogPinBtn: "📌 この曜日・時限に固定して再計算",
    slotDialogForbidBtn: "🚫 この曜日・時限を禁止にして再計算",
    slotDialogClearBtn: "この科目の追加ルールを解除",
    dialogCloseLabel: "閉じる",

    nanoDialogTitle: "🤖 Chrome Built-in AI (Gemini Nano) 有効化ガイド",
    nanoDialogIntroHtml:
      '左側のAIチャットは、Chrome ブラウザに内蔵されたオンデバイス AI (<code>self.LanguageModel</code> API / <strong>Gemini Nano</strong>) を使用します。',
    nanoDialogStep1Html:
      '<code>chrome://flags/#optimization-guide-on-device-model</code> を開き、<strong>Enabled BypassPerfRequirement</strong> に設定します。',
    nanoDialogStep2Html:
      '<code>chrome://flags/#prompt-api-for-gemini-nano</code> を <strong>Enabled</strong> に設定して Chrome を再起動します。',
    nanoDialogStep3Html:
      '<code>chrome://components</code> の <strong>Optimization Guide On Device Model</strong> で「アップデートを確認」を実行します。',
    nanoDialogNote:
      "💡 Gemini Nano が未有効の環境でも、右側の時間割ボード操作・チュートリアル・条件変更・WaSHI (HiGHS) による最適化と矛盾診断はすべてご利用いただけます。",
    nanoDialogRecheckBtn: "🔄 ステータスを再確認",
    nanoDialogCloseBtn: "閉じる",

    trajDialogTitle: "📋 AI × WaSHI 実行ログ (Trajectory Export)",
    trajDialogDesc:
      "各ターンの Gemini Nano への送信プロンプト・JSON Schema・生JSON出力・抽出されたオペレーション・WaSHI (HiGHS) の求解結果を完全記録しています。",
    trajCopyBtn: "📋 JSONをクリップボードにコピー",
    trajDownloadBtn: "📥 JSONファイルを保存 (.json)",
    trajClearBtn: "🗑️ ログをクリア",

    promptCatalogBtn: "📖 プロンプト集",
    promptCatalogTitle: "🤖 Gemini Nano 想定質問・指示プロンプト集 (8カテゴリ)",
    promptCatalogIntro:
      "Gemini Nano が自然言語から正確に構造化（JSON toolCalls）して WaSHI × HiGHS ソルバーに渡せる代表的な指示例です。クリックするとチャット入力欄に自動入力されます。",
    promptCatalogCloseBtn: "閉じる",
    promptCatalogCategories: [
      {
        title: "👨‍🏫 1. 教員の出講都合・出講制限",
        items: [
          {
            label: "佐藤先生は月曜日休みにして",
            desc: "特定教員の特定曜日を終日出講NGにします",
            prompt: "佐藤先生(P01)は月曜日を終日出講不可(NG)に設定して",
          },
          {
            label: "小林先生は火・木の午後(3〜5限)のみ可能にする",
            desc: "非常勤講師の来校可能枠を限定します",
            prompt: "非常勤の小林先生(P09)は火曜と木曜の午後(3〜5限)しか来られないように設定して",
          },
          {
            label: "鈴木先生の1限・5限回避希望を設定",
            desc: "教員の1限・5限回避のソフト希望（全曜日）を設定します",
            prompt: "鈴木先生(P02)は1限と5限のコマをなるべく避けるように設定して",
          },
          {
            label: "高橋先生の1日上限を2コマに制限",
            desc: "特定教員の1日担当コマ数の上限を変更します",
            prompt: "高橋先生(P03)の1日最大担当コマ数を2コマまでに制限して",
          },
        ],
      },
      {
        title: "📌 2. 授業の配置・固定（ピン留め）",
        items: [
          {
            label: "数理最適化(C15)を火曜2限・101大講義室に固定",
            desc: "指定科目を特定の曜日・時限・教室に強制固定します",
            prompt: "数理最適化(C15)を火曜2限の101大講義室(R101)に固定して、時間割を再最適化して",
          },
          {
            label: "機械学習(C16)の2コマを火2・木2に固定",
            desc: "週2コマ科目を指定の2スロットに固定します",
            prompt: "機械学習(C16)の週2コマを火曜2限と木曜2限に固定して",
          },
          {
            label: "情報科学概論(C01)を月曜1限に配置",
            desc: "1年次必修のキックオフ講義を固定します",
            prompt: "情報科学概論(C01)を月曜1限に配置して",
          },
        ],
      },
      {
        title: "🚫 3. 開講禁止枠・裏番組（重複）回避",
        items: [
          {
            label: "機械学習(C16)と自然言語処理(C17)の裏番組を禁止",
            desc: "2科目を同一曜日・時限に開講させない制約を追加します",
            prompt: "機械学習(C16)と自然言語処理(C17)は両方履修する学生が多いので、同じ曜日・時限に被せないで",
          },
          {
            label: "情報セキュリティ(C18)は月1・金5を避けて",
            desc: "科目の特定曜日・時限への配置を禁止します",
            prompt: "情報セキュリティ(C18)は月曜1限と金曜5限を避けて配置して",
          },
          {
            label: "プログラミング演習A(C05)を金曜NGに",
            desc: "科目の特定曜日終日配置を禁止します",
            prompt: "プログラミング入門演習A(C05)を金曜日に配置しないで",
          },
        ],
      },
      {
        title: "🔗 4. 連続コマ・履修順序（先行関係）",
        items: [
          {
            label: "ソフトウェア設計演習(C12)の2コマを連続開講",
            desc: "週2コマを同日の連続時限（例: 2-3限）にまとめて配置します",
            prompt: "ソフトウェア設計演習(C12)の週2コマは、同じ曜日の連続する時限(2コマ連続)にまとめて開講して",
          },
          {
            label: "演習A(C05)を演習B(C06)より前または同日に開講",
            desc: "先行科目と後続科目のカリキュラム順序を守らせます",
            prompt: "プログラミング入門演習A(C05)は演習B(C06)と同じ曜日か、それより前の曜日に開講して",
          },
        ],
      },
      {
        title: "🏫 5. 教室・設備・メンテ閉鎖",
        items: [
          {
            label: "ソフトウェア設計演習(C12)にPC演習室を必須指定",
            desc: "端末設備が必要な講義にPC演習室を義務付けます",
            prompt: "ソフトウェア設計演習(C12)はPC演習室(pc_lab)を必ず使わせて",
          },
          {
            label: "数理最適化ゼミ(C23)をゼミ室限定に",
            desc: "少人数ゼミにゼミ室を割り当て大教室を空けます",
            prompt: "数理最適化ゼミ(C23)は大講義室を使わないで、ゼミ室にして",
          },
          {
            label: "301 PC演習室Aを木曜午後にメンテ閉鎖",
            desc: "定期保守や行事による特定時限の教室閉鎖を登録します",
            prompt: "301 PC演習室A(R301)は木曜日の午後(3〜5限)にネットワーク機器メンテナンスで閉鎖して",
          },
        ],
      },
      {
        title: "⚖️ 6. 全体ポリシー・上限設定の変更",
        items: [
          {
            label: "教員の連続講義を禁止(最大1コマ)に変更",
            desc: "全教員の連続講義ポリシーを厳格化します",
            prompt: "教員の連続講義上限を2コマから1コマ(連続講義なし)に変更して組み直して",
          },
          {
            label: "教員の1日上限を2コマに変更",
            desc: "教員の1日負担を全体的に緩和します",
            prompt: "教員の1日最大講義コマ数を2コマに変更して",
          },
          {
            label: "微調整モード(既存時間割の維持)をON",
            desc: "既存のコマ配置を可能な限り変更せずに解きます",
            prompt: "微調整モード(既存の時間割をなるべく維持)をONにして",
          },
        ],
      },
      {
        title: "💥 7. 矛盾診断・トラブルシューティング",
        items: [
          {
            label: "非常勤講師のNG曜日に固定して矛盾診断",
            desc: "出講不可日との矛盾を注入し、WaSHI (HiGHS) の原因特定を検証します",
            prompt: "火曜と木曜しか来られない非常勤の小林先生の情報セキュリティ(C18)を月曜3限に固定するとどうなるか矛盾診断して",
          },
          {
            label: "大講義室ダブルブッキングの矛盾を診断",
            desc: "定員と教室重複による解なし(Infeasible)を診断します",
            prompt: "130名超の1年必修2科目を両方「火曜2限・101大講義室」に固定して矛盾診断して",
          },
          {
            label: "PC演習室不足の矛盾を診断",
            desc: "設備不足による矛盾を診断します",
            prompt: "PC演習室が2室しかないのにPC必須3科目を「月曜2限」に同時固定して診断して",
          },
        ],
      },
      {
        title: "↩️ 8. ルールのリセット・解除",
        items: [
          {
            label: "追加ルールをすべて解除する",
            desc: "個別に追加した固定や禁止をリセットします",
            prompt: "個別に追加したカスタムルールをすべて解除して",
          },
          {
            label: "全体を初期状態に完全リセットする",
            desc: "時間割・設定・追加ルールをすべて初期化します",
            prompt: "すべての時間割設定・追加ルールを初期状態にリセットして",
          },
        ],
      },
    ],

    catMgmtBadge: "基礎データ",
    catMgmtTitle: "大学基礎データ管理（教員・教室・科目）",
    catMgmtDesc:
      "時間割編成の基礎となる教員名簿・教室設備・開講科目です。",
    btnCatGenerate: "🎲 サンプルデータを読み込む",
    btnCatImportCsv: "📂 CSVインポート",
    btnCatDownloadSamples: "📥 CSVテンプレート",
    btnCatClearBlank: "🗑️ 白紙に戻す",
    catEmptyTitle: "大学時間割の編成を始める（基礎データの登録）",
    catEmptyDesc:
      "時間割を自動編成するには、まず教員名簿・教室設備・開講科目が必要です。下のボタンからサンプルデータを読み込むか、CSVファイルをインポートしてください。",
    catEmptyGenMain: "🎲 サンプルデータを読み込む",
    catEmptyGenSub: "情報科学科モデル (10教員・7教室・25科目・計30コマ)",
    catEmptyImportMain: "📂 CSVファイルからインポート",
    catEmptyImportSub: "お手元の教員・教室・科目のCSVデータを取り込む",
    catEmptySamplesBtn: "📥 サンプルCSVの雛形をダウンロード",
  } as TimetableUiStrings & { cfgMaxConsecutiveHtml?: string },

  en: {
    pageTitle: "University Course Timetabling AI Copilot — Gemini Nano × WaSHI",
    headerTitle: "🎓 University Timetabling AI Copilot (UCTP)",
    btnTutorial: "🔰 Quick Guide",
    btnTheory: "📖 Theory Article",
    navApps: "← Apps",
    navAiShift: "🏥 AI Shift",
    themeToggleTitle: "Toggle Light / Dark Theme",

    chatPaneAria: "AI Timetabling Chat Workspace",
    chatHeaderTitle: "AI Timetabling Copilot",
    trajectoryBtnTitle: "Inspect, copy, or export AI prompts, JSON outputs, and WaSHI solver logs",
    nanoChecking: "⏳ Checking",
    nanoReady: "🟢 Gemini Nano Ready",
    nanoDownloading: "⏬ Downloading...",
    nanoDownloadable: "🟡 Gemini Nano Available",
    nanoUnavailableBadge: "⚪ Built-in AI Off",
    nanoSetupBtnTitle: "Chrome Built-in AI (Gemini Nano) Setup Guide",
    nanoUnavailBannerText: "⚠️ Chrome Built-in AI (Gemini Nano) is not enabled",
    nanoSetupLink: "Setup Guide",
    nanoRetryLink: "Recheck",
    chatLogAria: "Chat History",
    chatSenderUser: "👤 You (Academic Affairs)",
    chatSenderAssistant: "🤖 Timetabling AI Copilot",
    chatSenderSystem: "ℹ️ System",
    chatWelcomeMarkdown:
      "👋 **Welcome to the University Course Timetabling AI Copilot (UCTP)!**\n\n" +
      "Starting in **Blank Slate mode**. Prepare your data using one of the following:\n" +
      "1. **\"✨ Generate Sample\"**: Automatically create a realistic dataset with 10 professors, 7 lecture halls/labs, and 25 courses.\n" +
      "2. **\"📂 Import CSV\"**: Load your own separate CSV files for professors, rooms, and courses (downloadable templates available).\n\n" +
      "Once loaded, click **\"Auto-Schedule Timetable\"** to optimize using **WaSHI (HiGHS)**. You can also chat to add custom constraints!",

    popoverHeader: "💡 Click an example request to populate the chat box",
    promptChips: [
      {
        label: "📌 Pin Math Optimization (C15) to Tue P2 in Hall 101",
        prompt: "Pin Mathematical Optimization (C15) to Tue Period 2 in Hall 101 (R101) and re-optimize",
      },
      {
        label: "🕒 Restrict Adjunct Prof. Kobayashi to Tue/Thu afternoons (P3–P5)",
        prompt: "Adjunct Prof. Kobayashi (P09) can only teach on Tue and Thu afternoons (Periods 3, 4, 5)",
      },
      {
        label: "🚫 Prevent Machine Learning (C16) & NLP (C17) from overlapping",
        prompt: "Do not schedule Machine Learning (C16) and Natural Language Processing (C17) in the same period",
      },
      {
        label: "🔗 Schedule Software Design Lab (C12) in 2 consecutive periods",
        prompt: "Schedule the 2 weekly sessions of Software Design Lab (C12) in consecutive periods on the same day",
      },
      {
        label: "📅 Mark Friday afternoon (P3–P5) unavailable for Prof. Sato",
        prompt: "Mark Friday afternoon (Periods 3, 4, 5) as unavailable (NG) for Prof. Sato (P01)",
      },
      {
        label: "🛠️ Close 301 PC Lab A on Thursday afternoon for maintenance",
        prompt: "Close 301 PC Lab A (R301) on Thursday afternoon (Periods 3, 4, 5) for network maintenance",
      },
      {
        label: "⚖️ Limit faculty consecutive teaching to at most 1 period",
        prompt: "Change maximum consecutive teaching periods for professors from 2 to 1 and re-solve",
      },
      {
        label: "💥 Diagnose conflict: Pin Adjunct Kobayashi's course to Monday P3",
        prompt: "Diagnose what happens if we pin Information Security (C18, taught by Tue/Thu-only Adjunct Kobayashi) to Mon P3",
      },
    ],
    chatInputLabel: "Message to AI Timetabling Copilot",
    chatPlaceholder:
      'Enter scheduling rules or changes (e.g., "Pin Math Optimization to Tue P2", "Prof. Kobayashi only Tue/Thu afternoons")',
    btnExamples: "💡 Examples",
    autoSolveLabel: "Auto Re-solve",
    autoSolveTitle: "Automatically re-optimize when constraints are updated",
    btnChatAbort: "⏹ Stop",
    btnChatSend: "Send",

    tutorialTitle: "🔰 Quick Guide: 3-Step Walkthrough for AI University Timetabling (UCTP)",
    tutorialClose: "✕ Close",
    step1Badge: "STEP 1",
    step1Title: "Review & Load Master Data",
    step1DescHtml:
      "Prepare faculty, room, and course master data first via <strong>🎲 Generate Samples</strong> or <strong>📂 Import CSV</strong> (cells can also be edited directly in the tables).",
    step1Btn: "🎲 Try: Load Sample Data",
    step2Badge: "STEP 2",
    step2Title: "Configure Rules & Consult AI",
    step2DescHtml:
      "Configure academic constraints such as instructor availability, consecutive lab periods, and PC room requirements in the <strong>⚙️ Rules</strong> tab or chat.",
    step2Btn: '🔗 Try: Require "SW Design Lab (2 sessions)" in Consecutive Periods',
    step3Badge: "STEP 3",
    step3Title: "Auto-Schedule, Drag & Diagnose",
    step3DescHtml:
      "Optimize across 4 cohorts, faculty, and rooms simultaneously. Drag & drop sessions or auto-diagnose infeasible conflicts with WaSHI IIS.",
    step3SelectAria: "Select a conflict scenario to inject",
    step3Opt1: "Demo 1: Pin Tue/Thu-only Adjunct Prof. Kobayashi's course to Mon P3",
    step3Opt2: "Demo 2: Pin two 130+ student Y1 courses both to Tue P2 in Hall 101",
    step3Opt3: "Demo 3: Pin three PC-lab-required courses simultaneously to Mon P2 (only 2 PC labs)",
    step3Btn: "💥 Try: Inject Conflict Rule & Diagnose",

    statusPreparing: "Ready",
    statusSolving: "⏳ Solving...",
    statusOptimal: "✅ Optimal",
    statusFeasible: "✅ Feasible",
    statusInfeasible: "🚨 Infeasible",
    statusError: "⚠️ Error",
    btnAbortSolve: "⏹ Abort Solve",
    btnSolveWashi: "⚡ Re-Optimize Timetable",
    btnCheckCurrent: "🔍 Check Feasibility",
    btnCheckCurrentTitle: "Verify whether all current timetable constraints are mutually satisfiable",
    btnResetClean: "↩ Reset",
    btnResetCleanTitle: "Reset all custom rules and conflict demos back to the initial state",

    conflictBannerTitle: "🚨 Timetable Infeasible — Conflicting Rules Identified by WaSHI (HiGHS)",
    btnClearConflicts: "✨ Clear Conflicting Custom Rules & Re-Solve",
    btnAskAiConflict: "🤖 Ask AI How to Resolve",
    conflictAskPrompt: "Explain why the current timetable is infeasible and which rule we should relax",

    tabTimetable: "📅 Timetable Board (4 Cohorts × 10 Faculty × 7 Rooms)",
    tabConstraints: "⚙️ Constraints & Rules",
    tabCatalog: "📚 Master Data (Faculty, Rooms, Courses)",

    viewCohortsBtn: "🎓 4 Student Cohorts (Y1–Y4 Grid)",
    viewProfsBtn: "👨‍🏫 10 Faculty × 25 Slots Matrix",
    viewRoomsBtn: "🏫 7 Rooms × 25 Slots Matrix",
    legendPinned: "Pinned",
    legendChanged: "Changed",
    preserveToggleLabel: "🔒 Minimal Perturbation",
    preserveToggleTitle: "When ON, minimizes changes from the current timetable during re-optimization",
    diffToggleLabel: "✨ Highlight Changes",
    diffToggleTitle: "Highlight courses that moved compared to the previous timetable",

    crossBarLabel: "🔗 Cross-Board Link (Hover/Click to highlight across all 4 cohort tables):",
    crossBarAll: "Show All",
    adjunctSuffix: "(Adj)",
    periodColHeader: "Period",
    pinEmptySlotBtn: "+Pin",
    matrixProfCorner: "Professor (Title & Availability)",
    matrixRoomCorner: "Room (Capacity & Type)",
    matrixProfStatCol: "Weekly / Max Consec",
    matrixRoomStatCol: "Used / Util %",
    matrixUnavailDay: "Off",
    matrixUnavailSlot: "NG",
    matrixClosedSlot: "Closed",
    matrixFooterLabel: "Active Courses (of 7 Rooms)",

    customRulesTitle: "📌 Custom & Pinned Timetable Rules",
    customRulesDesc:
      "Rules added by clicking slots, chatting with AI, or using the builder below. Toggle ON/OFF, switch between Hard/Soft, or delete.",
    customRulesEmpty: "No custom rules are currently added.",
    btnApplyConfigSolve: "⚡ Apply Settings & Re-Solve",
    btnResetDefaultConfig: "↩ Restore Defaults",
    tagHardRule: "🔒 Hard Rule",
    tagSoftRule: "⚖️ Soft Pref",
    btnSwitchToSoft: "Make Soft",
    btnSwitchToHard: "Make Hard",
    btnDeleteRule: "Delete",

    newRuleKindLabel: "Rule Type",
    newRuleKindPin: "📌 Pin Course to Day & Period",
    newRuleKindForbid: "🚫 Forbid Day & Period for Course",
    newRuleKindNoOverlap: "⚡ No Time Overlap (2 Courses)",
    newRuleKindConsec: "🔗 Consecutive Periods (2-Session Course)",
    newRuleKindSameDay: "📅 Same-Day Sessions",
    newRuleCourse1Label: "Course A",
    newRuleCourse2Label: "Course B (for 2-course rule)",
    newRuleDayLabel: "Day",
    newRulePeriodLabel: "Period",
    newRuleRoomLabel: "Room (Optional)",
    autoAssignRoomOpt: "Auto-Assign (Any Compatible Room)",
    btnAddCustomRule: "+ Add Rule",

    card1Title: "🏛️ 1. Room Capacity, Equipment & Cohort Curriculum Rules",
    card1Desc: "Enable or disable structural physical and curriculum hard constraints in UCTP.",
    cfgRoomCapHtml:
      "<strong>Enforce Room Capacity</strong> (Forbid assigning a course to a room smaller than its enrollment)",
    cfgRoomEquipHtml:
      "<strong>Enforce Room Equipment & PC Lab Requirements</strong> (Programming/DS labs require PC rooms)",
    cfgCohortNoOverlapHtml:
      "<strong>Forbid Cohort Compulsory/Core Overlaps</strong> (Compulsory & core courses for the same year cannot overlap)",
    cfgForbidSameDayHtml:
      "<strong>Spread 2-Session Courses Across Different Days</strong> (Unless overridden by a consecutive/same-day rule)",

    card2Title: "👨‍🏫 2. Faculty Availability, Consecutive Caps & Student Hollow Gaps",
    card2Desc:
      "Configure adjunct day restrictions, faculty meeting NG slots, consecutive lecture caps, and soft penalty weights.",
    cfgAdjunctDaysHtml:
      "<strong>Enforce Adjunct Available Days</strong> (Prof. Kobayashi: Tue/Thu only; Prof. Kato: Wed/Fri only)",
    cfgProfAvailHtml:
      "<strong>Enforce Faculty Unavailable Slots</strong> (Faculty meetings, committees, medical slots)",
    cfgMaxConsecHtml: "<strong>Enforce Max Consecutive Teaching Periods</strong>",
    cfgNumMaxConsec: "Max Consecutive Periods (Faculty)",
    cfgNumMaxDaily: "Max Daily Sessions (Faculty)",
    cfgNumMaxCohortDaily: "Max Daily Compulsory (Cohort)",
    cfgNumWeightGap: "Student Idle Gap Penalty Weight",

    devInspectorSummary: "💻 Developer Inspector: View WaSHI TypeScript Model & LP Formulation",
    btnDiagnoseSingle: "🔍 Run Standalone WaSHI (HiGHS) Feasibility Check",

    catProfTitle: "👨‍🏫 Faculty Roster, Availability & Assigned Load (10 Faculty)",
    catProfDesc:
      "Contracted days, unavailable slots, P1/P5 preferences, and assigned weekly load in the current timetable.",
    catProfHeaders: [
      "ID",
      "Faculty Name",
      "Title",
      "Specialty",
      "Unavailable Days / NG Slots",
      "Preferences & Caps",
      "Current Assigned Load",
    ],
    catRoomTitle: "🏫 Lecture Halls, PC Labs & Utilization (7 Rooms)",
    catRoomHeaders: ["ID", "Room Name", "Type & Location", "Capacity", "Equipment", "Weekly Utilization (of 25)"],
    catCourseTitle: "📚 Course Catalog (25 Courses / 30 Weekly Sessions)",
    catCourseHeaders: [
      "ID",
      "Course Title",
      "Cohort & Category",
      "Instructor",
      "Enrollment & Sessions",
      "Room / Equipment Req.",
      "Assigned Slot & Room",
    ],

    slotDialogTitle: "Pin, Move, or Forbid Course Slot",
    slotDialogPinBtn: "📌 Pin to This Slot & Re-Solve",
    slotDialogForbidBtn: "🚫 Forbid This Slot & Re-Solve",
    slotDialogClearBtn: "Clear Custom Rules for This Course",
    dialogCloseLabel: "Close",

    nanoDialogTitle: "🤖 Chrome Built-in AI (Gemini Nano) Setup Guide",
    nanoDialogIntroHtml:
      'The left chat pane uses Chrome\'s on-device AI (<code>self.LanguageModel</code> API / <strong>Gemini Nano</strong>).',
    nanoDialogStep1Html:
      'Open <code>chrome://flags/#optimization-guide-on-device-model</code> and set it to <strong>Enabled BypassPerfRequirement</strong>.',
    nanoDialogStep2Html:
      'Open <code>chrome://flags/#prompt-api-for-gemini-nano</code>, set it to <strong>Enabled</strong>, and relaunch Chrome.',
    nanoDialogStep3Html:
      'Open <code>chrome://components</code> and click "Check for update" under <strong>Optimization Guide On Device Model</strong>.',
    nanoDialogNote:
      "💡 Even without Gemini Nano enabled, all interactive timetable boards, tutorial steps, rule builders, and WaSHI (HiGHS) optimization & conflict diagnosis work 100% locally.",
    nanoDialogRecheckBtn: "🔄 Recheck Status",
    nanoDialogCloseBtn: "Close",

    trajDialogTitle: "📋 AI × WaSHI Execution Trajectory Export",
    trajDialogDesc:
      "Complete log of prompts sent to Gemini Nano, JSON Schema constraints, raw JSON outputs, extracted operations, and WaSHI (HiGHS) solve outcomes.",
    trajCopyBtn: "📋 Copy JSON to Clipboard",
    trajDownloadBtn: "📥 Download JSON (.json)",
    trajClearBtn: "🗑️ Clear Log",

    promptCatalogBtn: "📖 Prompt Catalog",
    promptCatalogTitle: "🤖 Gemini Nano Expected Questions & Prompt Catalog (8 Categories)",
    promptCatalogIntro:
      "Representative natural-language requests accurately parsed into JSON tool calls by Gemini Nano for the WaSHI × HiGHS solver. Click any item to populate the chat input.",
    promptCatalogCloseBtn: "Close",
    promptCatalogCategories: [
      {
        title: "👨‍🏫 1. Faculty Availability & Day Restrictions",
        items: [
          {
            label: "Give Prof. Sato Mondays Off",
            desc: "Marks all Monday slots as unavailable (NG) for Prof. Sato",
            prompt: "Mark all Monday periods as unavailable (NG) for Prof. Sato (P01)",
          },
          {
            label: "Restrict Adjunct Mr. Kobayashi to Tue/Thu Afternoon",
            desc: "Restricts part-time lecturer slots to Tue/Thu P3-P5 only",
            prompt: "Restrict adjunct lecturer Mr. Kobayashi (P09) to Tue and Thu afternoon (P3-P5) only",
          },
          {
            label: "Set Period 1 & Period 5 Avoidance for Prof. Suzuki",
            desc: "Soft preference avoiding early and late periods",
            prompt: "Set preferences for Prof. Suzuki (P02) to avoid Period 1 and Period 5",
          },
          {
            label: "Limit Prof. Takahashi to 2 Daily Sessions",
            desc: "Caps maximum teaching sessions per day",
            prompt: "Limit Prof. Takahashi (P03) to a maximum of 2 sessions per day",
          },
        ],
      },
      {
        title: "📌 2. Course Slot Pinning",
        items: [
          {
            label: "Pin Optimization (C15) to Tue P2 in Hall 101",
            desc: "Locks course to a specific day, period, and lecture hall",
            prompt: "Pin Mathematical Optimization (C15) to Tue P2 in Hall 101 (R101)",
          },
          {
            label: "Pin Machine Learning (C16) to Tue P2 and Thu P2",
            desc: "Locks two-session course to specific slots",
            prompt: "Pin Machine Learning (C16) sessions to Tue P2 and Thu P2",
          },
          {
            label: "Pin Intro to CS (C01) to Mon P1",
            desc: "Schedules first-year compulsory kickoff course",
            prompt: "Schedule Introduction to Computer Science (C01) on Mon P1",
          },
        ],
      },
      {
        title: "🚫 3. Slot Forbids & Overlap Prevention",
        items: [
          {
            label: "Prevent Overlap between ML (C16) and NLP (C17)",
            desc: "Prevents scheduling two courses at the same day/period",
            prompt: "Prevent time overlap between Machine Learning (C16) and Natural Language Processing (C17)",
          },
          {
            label: "Avoid Mon P1 & Fri P5 for Information Security (C18)",
            desc: "Forbids specific slots for a course",
            prompt: "Forbid Mon P1 and Fri P5 for Information Security (C18)",
          },
          {
            label: "Forbid Friday for Programming Lab A (C05)",
            desc: "Forbids an entire day for a course",
            prompt: "Do not schedule Introductory Programming Lab A (C05) on Friday",
          },
        ],
      },
      {
        title: "🔗 4. Consecutive Sessions & Curriculum Precedence",
        items: [
          {
            label: "Schedule SW Design Lab (C12) in Back-to-Back Slots",
            desc: "Groups 2 sessions into consecutive periods on the same day",
            prompt: "Schedule both sessions of Software Design Lab (C12) in consecutive periods on the same day",
          },
          {
            label: "Require Programming Lab A (C05) on or before Lab B (C06)",
            desc: "Enforces prerequisite calendar sequence",
            prompt: "Schedule Introductory Programming Lab A (C05) on the same day or earlier in the week than Lab B (C06)",
          },
        ],
      },
      {
        title: "🏫 5. Room, Equipment & Maintenance Closures",
        items: [
          {
            label: "Require PC Lab for SW Design Lab (C12)",
            desc: "Enforces specialized computer equipment requirements",
            prompt: "Require a PC lab (pc_lab) for Software Design Lab (C12)",
          },
          {
            label: "Restrict Seminar (C23) to Seminar Rooms",
            desc: "Frees large halls by assigning small seminar rooms",
            prompt: "Forbid large lecture halls for Optimization Seminar (C23) and use a seminar room",
          },
          {
            label: "Close PC Lab A (R301) on Thu Afternoon for Maintenance",
            desc: "Temporarily locks a room for maintenance or exams",
            prompt: "Close 301 PC Lab A (R301) on Thursday afternoon (P3-P5) for network maintenance",
          },
        ],
      },
      {
        title: "⚖️ 6. Global Policy Settings",
        items: [
          {
            label: "Forbid Consecutive Sessions for Faculty (Max 1)",
            desc: "Tightens faculty fatigue policy",
            prompt: "Set maximum consecutive periods for faculty to 1 and re-solve",
          },
          {
            label: "Set Faculty Daily Max to 2 Sessions",
            desc: "Lowers faculty workload per day",
            prompt: "Set maximum daily sessions for faculty to 2",
          },
          {
            label: "Turn on Minimal Perturbation Mode",
            desc: "Preserves current timetable assignments as much as possible",
            prompt: "Turn on minimal perturbation mode to preserve the current timetable",
          },
        ],
      },
      {
        title: "💥 7. Conflict Diagnosis & Troubleshooting",
        items: [
          {
            label: "Diagnose Adjunct Lecturer Slot Conflict",
            desc: "Pins adjunct course on unavailable day and runs IIS diagnosis",
            prompt: "Pin adjunct lecturer Kobayashi's course (C18) to Mon P3 and diagnose conflicting constraints",
          },
          {
            label: "Diagnose Lecture Hall Double-Booking",
            desc: "Pins two large compulsory courses to the same room/slot",
            prompt: "Inject room double-booking conflict demo and diagnose",
          },
          {
            label: "Diagnose PC Lab Capacity Overload",
            desc: "Pins 3 lab courses simultaneously when only 2 labs exist",
            prompt: "Inject PC lab overload conflict demo and diagnose",
          },
        ],
      },
      {
        title: "↩️ 8. Rule Resets & Clear",
        items: [
          {
            label: "Clear All Custom Rules",
            desc: "Removes all custom pins, forbids, and relation rules",
            prompt: "Clear all custom timetable rules",
          },
          {
            label: "Reset Timetable & Settings to Defaults",
            desc: "Completely resets state back to factory defaults",
            prompt: "Reset all timetable settings and custom rules to defaults",
          },
        ],
      },
    ],

    catMgmtBadge: "Master Data",
    catMgmtTitle: "University Master Data (Faculty, Classrooms & Curriculum)",
    catMgmtDesc:
      "Master rosters, facilities, and courses for university course timetabling.",
    btnCatGenerate: "🎲 Load Sample Data",
    btnCatImportCsv: "📂 Import CSV",
    btnCatDownloadSamples: "📥 Download CSV Templates",
    btnCatClearBlank: "🗑️ Clear to Blank",
    catEmptyTitle: "Get Started with University Timetabling (Master Data)",
    catEmptyDesc:
      "To auto-schedule timetables, baseline faculty, classroom, and course data are required. Load sample benchmark data below or import your own CSVs.",
    catEmptyGenMain: "🎲 Load Sample Data",
    catEmptyGenSub: "CS Dept Model (10 faculty, 7 rooms, 25 courses / 30 slots)",
    catEmptyImportMain: "📂 Import from CSV Files",
    catEmptyImportSub: "Upload your faculty, classroom, and course CSV files",
    catEmptySamplesBtn: "📥 Download Sample CSV Templates",
  },

  zh: {
    pageTitle: "大学排课 AI Copilot — Gemini Nano × WaSHI",
    headerTitle: "🎓 大学排课 AI Copilot (UCTP)",
    btnTutorial: "🔰 快速指南",
    btnTheory: "📖 原理解说",
    navApps: "← 应用列表",
    navAiShift: "🏥 护士排班",
    themeToggleTitle: "切换亮色/暗色主题",

    chatPaneAria: "AI 教务排课对话区",
    chatHeaderTitle: "AI 教务・排课助手",
    trajectoryBtnTitle: "查看、复制或导出 AI 提示词、JSON 输出与 WaSHI 求解日志",
    nanoChecking: "⏳ 检测中",
    nanoReady: "🟢 Gemini Nano 就绪",
    nanoDownloading: "⏬ 下载中...",
    nanoDownloadable: "🟡 Gemini Nano 可下载",
    nanoUnavailableBadge: "⚪ 内置AI 未启用",
    nanoSetupBtnTitle: "Chrome 内置 AI (Gemini Nano) 配置指南",
    nanoUnavailBannerText: "⚠️ Chrome 内置 AI (Gemini Nano) 尚未启用",
    nanoSetupLink: "配置步骤",
    nanoRetryLink: "重新检测",
    chatLogAria: "对话历史",
    chatSenderUser: "👤 您 (教务老师)",
    chatSenderAssistant: "🤖 排课 AI Copilot",
    chatSenderSystem: "ℹ️ 系统通知",
    chatWelcomeMarkdown:
      "👋 **欢迎使用大学课表编排 AI Copilot (UCTP)！**\n\n" +
      "当前处于**空白模式**。请通过以下方式之一准备排课基础数据：\n" +
      "1. **“✨ 生成示例”**：自动生成包含10位教师、7间教室与25门课程的典型工学院数据。\n" +
      "2. **“📂 导入CSV”**：分别导入教师、教室与课程的CSV文件（提供模板下载）。\n\n" +
      "数据就绪后，点击**“⚡ 自动编排课表”**即可通过 WaSHI (HiGHS) 求解最佳课表方案。您也可以通过对话追加各类排课约束！",

    popoverHeader: "💡 点击示例指令填入输入框（教务・教师排课需求示例）",
    promptChips: [
      {
        label: "📌 将《数学规划(C15)》固定在周二第2节・101大阶梯教室",
        prompt: "将数学规划(C15)固定在周二第2节的101大阶梯教室(R101)，并重新优化课表",
      },
      {
        label: "🕒 将外聘小林老师设为仅周二・周四下午(3〜5节)可出勤",
        prompt: "外聘的小林老师(P09)只有周二和周四的下午(第3〜5节)能来上课",
      },
      {
        label: "🚫 禁止《机器学习(C16)》与《自然语言处理(C17)》同时段冲突",
        prompt: "机器学习(C16)和自然语言处理(C17)同时选修的学生很多，请不要排在同一时段",
      },
      {
        label: "🔗 将《软件设计实验(C12)》的2节课设为同日相邻节次连排",
        prompt: "软件设计实验(C12)每周的2节课请安排在同一天的连续相邻节次(2节连排)",
      },
      {
        label: "📅 将佐藤老师周五下午(3〜5节)设为禁排(NG)",
        prompt: "佐藤老师(P01)周五下午(第3〜5节)因学术会议无法出勤(NG)",
      },
      {
        label: "🛠️ 周四下午关闭 301 PC机房A 进行网络设备维护",
        prompt: "301 PC机房A(R301)在周四下午(第3〜5节)因网络设备维护关闭停用",
      },
      {
        label: "⚖️ 禁止教师连续上课（将最大连续节数改为1节）",
        prompt: "将教师的最大连续上课节数从2节改为1节（禁止连堂），重新排课",
      },
      {
        label: "💥 冲突诊断：将仅周二/四可来的外聘小林老师的课固定到周一第3节",
        prompt: "如果把仅周二和周四能来的外聘小林老师的信息安全(C18)固定在周一第3节会怎样？请进行冲突诊断",
      },
    ],
    chatInputLabel: "向 AI 发送排课需求",
    chatPlaceholder: "输入排课要求或条件变更（例：「将数学规划固定在周二第2节」「小林老师仅周二周四下午可排」）",
    btnExamples: "💡 示例指令",
    autoSolveLabel: "自动重算",
    autoSolveTitle: "修改条件后自动运行数学规划求解",
    btnChatAbort: "⏹ 停止",
    btnChatSend: "发送",

    tutorialTitle: "🔰 快速指南：三步体验 AI 大学排课 (UCTP)",
    tutorialClose: "✕ 关闭",
    step1Badge: "STEP 1",
    step1Title: "查看与导入基础数据",
    step1DescHtml:
      "首先准备教师、教室与课程基础数据。可通过 <strong>🎲 生成示例</strong> 或 <strong>📂 导入 CSV</strong> 录入（也可直接在表格单元格中编辑）。",
    step1Btn: "🎲 试试：加载示例数据",
    step2Badge: "STEP 2",
    step2Title: "调整规则约束与 AI 咨询",
    step2DescHtml:
      "在「⚙️ 规则设置」标签页或对话栏中，添加教师出勤时段、连排实验、机房要求等实际业务约束。",
    step2Btn: "🔗 试试：将《软件设计实验(周2节)》设为同日连排",
    step3Badge: "STEP 3",
    step3Title: "自动排课・拖拽调整・矛盾诊断",
    step3DescHtml:
      "一键全局优化4个年级、教师及教室课表。可拖拽调整节次，或体验 WaSHI 冲突自动诊断 (IIS)。",
    step3SelectAria: "选择要注入的冲突演示场景",
    step3Opt1: "演示1: 将仅周二/四可出勤的外聘小林老师的课程强制固定在周一第3节",
    step3Opt2: "演示2: 将两门130人以上的大一必修课同时固定在“周二第2节・101大阶梯教室”",
    step3Opt3: "演示3: 全院仅有2间PC机房，却将3门必须用PC机房的实验课同时固定在“周一第2节”",
    step3Btn: "💥 试试：故意添加矛盾规则并执行冲突诊断",

    statusPreparing: "准备中",
    statusSolving: "⏳ 求解中...",
    statusOptimal: "✅ Optimal (最优解)",
    statusFeasible: "✅ Feasible (可行解)",
    statusInfeasible: "🚨 无解 (Infeasible)",
    statusError: "⚠️ 错误",
    btnAbortSolve: "⏹ 中断计算",
    btnSolveWashi: "⚡ 重新优化课表",
    btnCheckCurrent: "🔍 冲突与一致性检查",
    btnCheckCurrentTitle: "检查当前所有排课约束条件是否存在逻辑矛盾",
    btnResetClean: "↩ 重置",
    btnResetCleanTitle: "清空追加的自定义固定规则与冲突演示，恢复初始状态",

    conflictBannerTitle: "🚨 无法排出可行课表 — WaSHI (HiGHS) 已定位以下冲突规则",
    btnClearConflicts: "✨ 解除发生冲突的追加规则并重算",
    btnAskAiConflict: "🤖 询问 AI 解决方案",
    conflictAskPrompt: "请告诉我当前无法排课的原因，以及应该放宽哪条限制",

    tabTimetable: "📅 课表看板 (4年级 × 10教师 × 7教室)",
    tabConstraints: "⚙️ 约束与规则设置",
    tabCatalog: "📚 基础数据 (教师・教室・课程)",

    viewCohortsBtn: "🎓 按年级 4张同屏显示 (大一〜大四)",
    viewProfsBtn: "👨‍🏫 按教师 × 25时段矩阵 (10名)",
    viewRoomsBtn: "🏫 按教室 × 25时段矩阵 (7间)",
    legendPinned: "已固定",
    legendChanged: "较上次有变动",
    preserveToggleLabel: "🔒 微调模式",
    preserveToggleTitle: "开启时，重新优化将尽量保持现有课表不变（最小化变动课时数）",
    diffToggleLabel: "✨ 高亮变动课程",
    diffToggleTitle: "用橙色边框高亮显示与上一版课表相比发生移动的课程",

    crossBarLabel: "🔗 跨表联动检查 (悬停/点击可在4张年级课表中同步高亮同一教师或教室):",
    crossBarAll: "全部显示",
    adjunctSuffix: "(外聘)",
    periodColHeader: "节次",
    pinEmptySlotBtn: "＋固定",
    matrixProfCorner: "教师姓名 (职称・出勤条件)",
    matrixRoomCorner: "教室・机房 (容量・类型)",
    matrixProfStatCol: "周课时 / 最大连堂",
    matrixRoomStatCol: "占用数 / 利用率",
    matrixUnavailDay: "不可",
    matrixUnavailSlot: "禁排",
    matrixClosedSlot: "关闭",
    matrixFooterLabel: "同时开课门数 (共7间教室)",

    customRulesTitle: "📌 单独追加与固定的排课规则",
    customRulesDesc:
      "通过点击课表、AI 对话或下方表单追加的个性化排课约束。可随时勾选启用/停用、切换硬约束/软约束或删除。",
    customRulesEmpty: "当前没有单独追加的自定义规则。",
    btnApplyConfigSolve: "⚡ 应用设置并重新求解",
    btnResetDefaultConfig: "↩ 恢复默认设置",
    tagHardRule: "🔒 硬约束必选",
    tagSoftRule: "⚖️ 软约束偏好",
    btnSwitchToSoft: "改为软约束",
    btnSwitchToHard: "改为硬约束",
    btnDeleteRule: "删除",

    newRuleKindLabel: "要追加的规则类型",
    newRuleKindPin: "📌 固定课程的星期与节次",
    newRuleKindForbid: "🚫 禁止课程排在指定星期与节次",
    newRuleKindNoOverlap: "⚡ 禁止2门课程同时段冲突",
    newRuleKindConsec: "🔗 周2节课程同日相邻节次连排",
    newRuleKindSameDay: "📅 2节课/2门课同日开课",
    newRuleCourse1Label: "目标课程A",
    newRuleCourse2Label: "目标课程B (双课程规则用)",
    newRuleDayLabel: "星期",
    newRulePeriodLabel: "节次",
    newRuleRoomLabel: "指定教室(可选)",
    autoAssignRoomOpt: "自动分配 (符合容量与设备的教室)",
    btnAddCustomRule: "＋ 添加规则",

    card1Title: "🏛️ 1. 教室容量、设备与年级培养方案基本约束",
    card1Desc: "设置大学排课问题 (UCTP) 中的物理容量、机房设备与必修课互斥等硬约束。",
    cfgRoomCapHtml: "<strong>严格遵守教室容量限制</strong>（禁止将选课人数超过教室容量的课程排入该教室）",
    cfgRoomEquipHtml:
      "<strong>严格遵守教室设备与PC机房要求</strong>（编程实验与数据科学实验必须排在PC机房）",
    cfgCohortNoOverlapHtml:
      "<strong>禁止同一年级必修/限选课冲突</strong>（同一年级的必修课之间、必修与实验课之间不得重叠）",
    cfgForbidSameDayHtml:
      "<strong>防止周2节课程排在同一天</strong>（除非另有连排/同日规则，否则分散在不同星期）",

    card2Title: "👨‍🏫 2. 教师可出勤时段、连堂上限与学生空堂惩罚",
    card2Desc: "设置专任与外聘教师禁排时段、最大连续上课节数，以及目标函数的软约束权重。",
    cfgAdjunctDaysHtml:
      "<strong>严格遵守外聘讲师可出勤日</strong>（小林老师:仅周二/四 / 加藤老师:仅周三/五）",
    cfgProfAvailHtml: "<strong>严格遵守教师禁排时段（教授会・委员会・门诊等）</strong>",
    cfgMaxConsecHtml: "<strong>严格限制教师最大连续上课节数（防止过度连堂）</strong>",
    cfgNumMaxConsec: "教师 最大连续上课节数",
    cfgNumMaxDaily: "教师 单日最大课时数",
    cfgNumMaxCohortDaily: "年级 单日最大必修课时",
    cfgNumWeightGap: "学生中间空堂惩罚权重",

    devInspectorSummary: "💻 开发者检视器: 查看 WaSHI 数学模型代码与 LP 预览",
    btnDiagnoseSingle: "🔍 使用 WaSHI (HiGHS) 单独检验当前约束的逻辑一致性",

    catProfTitle: "👨‍🏫 教师名录、出勤条件与排课统计 (10名)",
    catProfDesc: "各位教师的禁排星期、禁排节次、第1/5节回避偏好，以及当前课表中的实际排课结果。",
    catProfHeaders: [
      "ID",
      "教师姓名",
      "职称・类别",
      "专业方向",
      "禁排日・禁排时段",
      "时段偏好・上限",
      "当前排课统计",
    ],
    catRoomTitle: "🏫 教室与机房名录、设备及利用率 (7间)",
    catRoomHeaders: ["ID", "教室名称", "类型・位置", "容量", "配备设备", "周利用率 (共25时段)"],
    catCourseTitle: "📚 开课科目一览 (共25门课・30节课)",
    catCourseHeaders: [
      "ID",
      "课程名称",
      "年级・类别",
      "授课教师",
      "选课人数・周课时",
      "必需设备・教室要求",
      "当前已排时段・教室",
    ],

    slotDialogTitle: "固定、移动或禁排课程时段",
    slotDialogPinBtn: "📌 固定到此星期・节次并重算",
    slotDialogForbidBtn: "🚫 禁止排在此星期・节次并重算",
    slotDialogClearBtn: "清除该课程的所有追加规则",
    dialogCloseLabel: "关闭",

    nanoDialogTitle: "🤖 Chrome 内置 AI (Gemini Nano) 启用指南",
    nanoDialogIntroHtml:
      "左侧 AI 对话使用 Chrome 浏览器内置的端侧模型 (<code>self.LanguageModel</code> API / <strong>Gemini Nano</strong>)。",
    nanoDialogStep1Html:
      "打开 <code>chrome://flags/#optimization-guide-on-device-model</code>，设为 <strong>Enabled BypassPerfRequirement</strong>。",
    nanoDialogStep2Html:
      "打开 <code>chrome://flags/#prompt-api-for-gemini-nano</code>，设为 <strong>Enabled</strong> 并重启 Chrome。",
    nanoDialogStep3Html:
      "打开 <code>chrome://components</code>，在 <strong>Optimization Guide On Device Model</strong> 下点击“检查更新”。",
    nanoDialogNote:
      "💡 即使在未启用 Gemini Nano 的环境中，右侧的多维课表看板、3步快速指南、规则构建器以及 WaSHI (HiGHS) 优化求解与冲突诊断功能均可 100% 正常使用。",
    nanoDialogRecheckBtn: "🔄 重新检测状态",
    nanoDialogCloseBtn: "关闭",

    trajDialogTitle: "📋 AI × WaSHI 执行日志导出 (Trajectory Export)",
    trajDialogDesc:
      "完整记录每一轮发送给 Gemini Nano 的提示词、JSON Schema、原始 JSON 输出、提取的排课操作指令及 WaSHI (HiGHS) 求解结果。",
    trajCopyBtn: "📋 复制 JSON 到剪贴板",
    trajDownloadBtn: "📥 下载 JSON 文件 (.json)",
    trajClearBtn: "🗑️ 清空日志",

    promptCatalogBtn: "📖 指令示例库",
    promptCatalogTitle: "🤖 Gemini Nano 预期指令与提问示例库 (8个分类)",
    promptCatalogIntro:
      "Gemini Nano 可准确结构化为 JSON toolCalls 并交由 WaSHI × HiGHS 求解器处理的典型指令示例。点击任意项即可自动填入对话框。",
    promptCatalogCloseBtn: "关闭",
    promptCatalogCategories: [
      {
        title: "👨‍🏫 1. 教师出勤限制与偏好",
        items: [
          {
            label: "给佐藤教授周一排休",
            desc: "将佐藤教授 (P01) 的周一全天设为不可出勤 (NG)",
            prompt: "将佐藤教授(P01)的周一全天设为不可出勤(NG)",
          },
          {
            label: "限制兼职小林老师仅周二・周四下午排课",
            desc: "限制兼职讲师仅在周二・周四第3~5节上课",
            prompt: "将兼职讲师小林老师(P09)的授课时间限制在周二和周四下午(3~5节)",
          },
          {
            label: "设置铃木教授避开第1节与第5节",
            desc: "设置避开早晚节次的软性排课偏好",
            prompt: "尽量避免给铃木教授(P02)排第1节与第5节课",
          },
          {
            label: "限制高桥教授单日最多2节课",
            desc: "设置教师单日最大授课节数上限",
            prompt: "将高桥教授(P03)单日最大授课节数限制为2节",
          },
        ],
      },
      {
        title: "📌 2. 课程时段与教室固定 (Pin)",
        items: [
          {
            label: "将《数理最优化》固定在周二第2节・101大教室",
            desc: "强制将指定课程锁定到特定星期、节次与大讲堂",
            prompt: "将数理最优化(C15)固定在周二第2节・101大讲堂(R101)",
          },
          {
            label: "将《机器学习》2节课分别固定在周二2节与周四2节",
            desc: "将周多节课程锁定到具体的多个时段",
            prompt: "将机器学习(C16)的两节课分别固定在周二第2节与周四第2节",
          },
          {
            label: "将《计算机导论》排在周一第1节",
            desc: "固定大一开学必修课时段",
            prompt: "将计算机科学导论(C01)安排在周一第1节",
          },
        ],
      },
      {
        title: "🚫 3. 禁排时段与防课程时间冲突",
        items: [
          {
            label: "禁止《机器学习》与《自然语言处理》同时间开课",
            desc: "防止同选率高的两门课排在相同星期和节次",
            prompt: "机器学习(C16)与自然语言处理(C17)选课重叠较多，请禁止时间冲突",
          },
          {
            label: "《信息安全》避开周一第1节与周五第5节",
            desc: "禁止特定课程排在指定时段",
            prompt: "信息安全(C18)避开周一第1节与周五第5节排课",
          },
          {
            label: "《编程实验A》周五不排课",
            desc: "禁止课程排在特定星期的全天时段",
            prompt: "程序设计入门实验A(C05)周五不要排课",
          },
        ],
      },
      {
        title: "🔗 4. 连堂授课与修读顺序 (先行约束)",
        items: [
          {
            label: "《软件设计实验》连排2节课",
            desc: "将同门课程的多节课连续安排在同一天的相邻节次",
            prompt: "将软件设计实验(C12)的每周2节课连排在同一天的连续节次",
          },
          {
            label: "《实验A》安排在《实验B》同天或之前",
            desc: "确保修读先后的课程序列约束",
            prompt: "程序设计入门实验A(C05)必须排在实验B(C06)相同星期或更早的星期",
          },
        ],
      },
      {
        title: "🏫 5. 教室设备要求与维护封停",
        items: [
          {
            label: "《软件设计实验》必须使用PC机房",
            desc: "满足实验课对电脑设备的强制要求",
            prompt: "软件设计实验(C12)必须使用PC机房(pc_lab)",
          },
          {
            label: "《最优化研讨课》改用研讨室，腾出大教室",
            desc: "小班研讨课转入专用研讨室",
            prompt: "数理最优化研讨班(C23)不要占用大教室，请使用研讨室",
          },
          {
            label: "301 PC机房周四下午网络维护关闭",
            desc: "因设备检修或考试封停指定教室时段",
            prompt: "301 PC演练室A(R301)周四下午(3~5节)进行网络维护，设置为封停不可用",
          },
        ],
      },
      {
        title: "⚖️ 6. 全局排课策略与上限配置",
        items: [
          {
            label: "禁止教师连堂授课 (最大连续1节)",
            desc: "提高教师疲劳控制策略标准",
            prompt: "将教师最大连续讲课节数上限设为1节",
          },
          {
            label: "将教师单日授课上限设为2节",
            desc: "缓解教师单日教学负荷",
            prompt: "将教师单日最大授课节数设为2节",
          },
          {
            label: "开启微调模式 (尽量保持现有排课不变)",
            desc: "在现有排课基础上做最小扰动微调",
            prompt: "开启微调模式，尽量保留现有课表布局进行调整",
          },
        ],
      },
      {
        title: "💥 7. 冲突诊断与故障排查演示",
        items: [
          {
            label: "诊断兼职教师出勤冲突",
            desc: "在兼职讲师不可出勤日排课，验证 WaSHI (HiGHS) 冲突归因",
            prompt: "将仅周二周四可出勤的小林老师的课(C18)强制排在周一第3节，并诊断冲突",
          },
          {
            label: "诊断大讲堂双重占用冲突",
            desc: "将两门超百人必修大课同时安排在同一教室",
            prompt: "注入大阶梯教室双重排课冲突演示并诊断",
          },
          {
            label: "诊断PC机房容量超负荷冲突",
            desc: "在仅有2间机房的情况下同时安排3门机房课",
            prompt: "注入PC机房容量不足冲突演示并诊断",
          },
        ],
      },
      {
        title: "↩️ 8. 规则重置与初始化",
        items: [
          {
            label: "清除所有自定义追加规则",
            desc: "一键清空用户手动追加的固定与禁排规则",
            prompt: "清除所有自定义排课规则",
          },
          {
            label: "完全重置所有课表与全局设置",
            desc: "恢复到出厂默认课表与初始参数",
            prompt: "将所有排课设置与自定义规则重置为初始状态",
          },
        ],
      },
    ],

    catMgmtBadge: "基础数据",
    catMgmtTitle: "大学基础数据管理 (教师・教室・课程)",
    catMgmtDesc:
      "排课所需的基础教师名册、教室设备和开课课程。",
    btnCatGenerate: "🎲 载入示例数据",
    btnCatImportCsv: "📂 CSV导入",
    btnCatDownloadSamples: "📥 下载CSV模板",
    btnCatClearBlank: "🗑️ 恢复为空白",
    catEmptyTitle: "开始大学排课（录入基础数据）",
    catEmptyDesc:
      "自动排课需要先录入教师、教室及课程数据。请点击下方按钮载入示例基准数据，或导入自有CSV文件。",
    catEmptyGenMain: "🎲 载入示例数据",
    catEmptyGenSub: "计算机系模型 (10位教师・7间教室・25门课・计30节)",
    catEmptyImportMain: "📂 从 CSV 文件导入",
    catEmptyImportSub: "导入自有的教师、教室与课程 CSV 数据",
    catEmptySamplesBtn: "📥 下载示例 CSV 模板",
  },
};
