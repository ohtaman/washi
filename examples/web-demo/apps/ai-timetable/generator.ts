import {
  type CourseProfile,
  type CustomTimetableRule,
  type ProfessorProfile,
  type RoomProfile,
  type TimetableConfig,
  type TimetableState,
} from "./types.js";

export function createDefaultTimetableConfig(
  overrides?: Partial<TimetableConfig>
): TimetableConfig {
  return {
    academicYear: 2026,
    semester: "autumn",
    seed: 202610,

    enforceRoomCapacity: true,
    enforceRoomEquipment: true,
    enforceCohortNoOverlap: true,
    enforceProfessorAvailability: true,
    enforceAdjunctDayRestrictions: true,
    forbidSameCourseSameDay: true,
    enforceMaxConsecutivePeriods: true,
    maxProfessorConsecutivePeriods: 2,
    maxProfessorSessionsPerDay: 3,
    maxCohortCompulsoryPerDay: 4,
    preserveCurrentTimetable: true,

    weightAvoidPeriod1: 20,
    weightAvoidPeriod5: 15,
    weightCohortIdleGaps: 25,
    weightRoomFit: 5,
    ...overrides,
  };
}

export function createDefaultRooms(): RoomProfile[] {
  return [
    {
      id: "R101",
      name: "101大講義室",
      shortName: "101大",
      building: "情報棟1F",
      capacity: 150,
      roomType: "large_hall",
      equipment: ["projector", "mic", "recording"],
      aliases: ["R101", "101", "101大講義室", "101大", "大講義室101"],
    },
    {
      id: "R102",
      name: "102大講義室",
      shortName: "102大",
      building: "情報棟1F",
      capacity: 120,
      roomType: "large_hall",
      equipment: ["projector", "mic", "recording"],
      aliases: ["R102", "102", "102大講義室", "102大", "大講義室102"],
    },
    {
      id: "R201",
      name: "201中講義室",
      shortName: "201中",
      building: "情報棟2F",
      capacity: 85,
      roomType: "medium_room",
      equipment: ["projector", "mic", "moveable_desks"],
      aliases: ["R201", "201", "201中講義室", "201中", "中講義室201"],
    },
    {
      id: "R202",
      name: "202中講義室",
      shortName: "202中",
      building: "情報棟2F",
      capacity: 75,
      roomType: "medium_room",
      equipment: ["projector", "mic", "moveable_desks"],
      aliases: ["R202", "202", "202中講義室", "202中", "中講義室202"],
    },
    {
      id: "R301",
      name: "301 PC演習室A",
      shortName: "301PC-A",
      building: "情報棟3F",
      capacity: 70,
      roomType: "pc_lab",
      equipment: ["projector", "mic", "pc_terminal", "recording"],
      aliases: ["R301", "301", "301PC", "301 PC演習室A", "PC演習室A", "PC室A"],
    },
    {
      id: "R302",
      name: "302 PC演習室B",
      shortName: "302PC-B",
      building: "情報棟3F",
      capacity: 60,
      roomType: "pc_lab",
      equipment: ["projector", "mic", "pc_terminal"],
      aliases: ["R302", "302", "302PC", "302 PC演習室B", "PC演習室B", "PC室B"],
    },
    {
      id: "R401",
      name: "401ゼミ室",
      shortName: "401ゼミ",
      building: "情報棟4F",
      capacity: 40,
      roomType: "seminar_room",
      equipment: ["projector", "moveable_desks"],
      aliases: ["R401", "401", "401ゼミ室", "401ゼミ", "ゼミ室"],
    },
  ];
}

export function createDefaultProfessors(): ProfessorProfile[] {
  return [
    {
      id: "P01",
      name: "佐藤 健一",
      kana: "さとう けんいち",
      title: "教授",
      employment: "full_time",
      specialty: "数理最適化・オペレーションズリサーチ",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Wed", period: 5, reason: "学部長・教授会定例" },
      ],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
    {
      id: "P02",
      name: "鈴木 美咲",
      kana: "すずき みさき",
      title: "教授",
      specialty: "機械学習・自然言語処理",
      employment: "full_time",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Wed", period: 5, reason: "教授会定例" },
        { day: "Mon", period: 1, reason: "共同研究定例ミーティング" },
      ],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
    {
      id: "P03",
      name: "高橋 誠",
      kana: "たかはし まこと",
      title: "教授",
      employment: "full_time",
      specialty: "アルゴリズム・離散数学",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Wed", period: 5, reason: "教授会定例" },
      ],
      avoidPeriod1: false,
      avoidPeriod5: true,
      maxSessionsPerDay: 2,
    },
    {
      id: "P04",
      name: "田中 彩乃",
      kana: "たなか あやの",
      title: "准教授",
      employment: "full_time",
      specialty: "ソフトウェア工学・プログラミング言語",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Fri", period: 5, reason: "保育園お迎え" },
      ],
      avoidPeriod1: false,
      avoidPeriod5: true,
      maxSessionsPerDay: 3,
    },
    {
      id: "P05",
      name: "伊藤 大輔",
      kana: "いとう だいすけ",
      title: "准教授",
      employment: "full_time",
      specialty: "データベース・分散システム",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Tue", period: 1, reason: "全学情報基盤委員会" },
      ],
      avoidPeriod1: false,
      avoidPeriod5: false,
      maxSessionsPerDay: 3,
    },
    {
      id: "P06",
      name: "渡辺 結衣",
      kana: "わたなべ ゆい",
      title: "准教授",
      employment: "full_time",
      specialty: "統計科学・データマイニング",
      unavailableDays: [],
      unavailableSlots: [],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
    {
      id: "P07",
      name: "山本 翔太",
      kana: "やまもと しょうた",
      title: "講師",
      employment: "full_time",
      specialty: "コンピュータシステム・OS・計算機科学基礎",
      unavailableDays: [],
      unavailableSlots: [],
      avoidPeriod1: false,
      avoidPeriod5: false,
      maxSessionsPerDay: 3,
    },
    {
      id: "P08",
      name: "中村 凛",
      kana: "なかむら りん",
      title: "講師",
      employment: "full_time",
      specialty: "HCI・インタラクティブシステム・Web工学",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Thu", period: 1, reason: "通院・定期健診枠" },
      ],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
    {
      id: "P09",
      name: "小林 拓海",
      kana: "こばやし たくみ",
      title: "非常勤講師",
      employment: "adjunct",
      specialty: "情報セキュリティ・暗号理論（セキュリティ企業研究所長）",
      // Adjunct: only available Tue & Thu
      unavailableDays: ["Mon", "Wed", "Fri"],
      unavailableSlots: [
        { day: "Tue", period: 1, reason: "本社業務のため午後または2限以降希望" },
      ],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
    {
      id: "P10",
      name: "加藤 優奈",
      kana: "かとう ゆうな",
      title: "非常勤講師",
      employment: "adjunct",
      specialty: "クラウドアーキテクチャ・情報倫理（テック企業VPoE）",
      // Adjunct: only available Wed & Fri
      unavailableDays: ["Mon", "Tue", "Thu"],
      unavailableSlots: [
        { day: "Wed", period: 1, reason: "移動時間確保のため1限不可" },
        { day: "Fri", period: 1, reason: "移動時間確保のため1限不可" },
      ],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
  ];
}

export function createDefaultCourses(): CourseProfile[] {
  return [
    // ==================== 1年次 (Y1: 135名) ====================
    {
      id: "C01",
      title: "情報科学概論",
      shortTitle: "情報科学概論",
      professorId: "P07", // 山本
      cohorts: ["Y1"],
      category: "compulsory",
      enrollment: 135,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C01", "情報科学概論", "情報概論"],
    },
    {
      id: "C02",
      title: "線形代数学I",
      shortTitle: "線形代数I",
      professorId: "P01", // 佐藤 (週2コマ: 講義+演習講義)
      cohorts: ["Y1"],
      category: "compulsory",
      enrollment: 130,
      sessionsPerWeek: 2,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C02", "線形代数学I", "線形代数I", "線形代数"],
    },
    {
      id: "C03",
      title: "微分積分学I",
      shortTitle: "微積分I",
      professorId: "P06", // 渡辺
      cohorts: ["Y1"],
      category: "compulsory",
      enrollment: 125,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C03", "微分積分学I", "微積分I", "微積分", "微分積分"],
    },
    {
      id: "C04",
      title: "離散数学基礎",
      shortTitle: "離散数学",
      professorId: "P03", // 高橋
      cohorts: ["Y1"],
      category: "compulsory",
      enrollment: 115,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C04", "離散数学基礎", "離散数学"],
    },
    {
      id: "C05",
      title: "プログラミング入門演習A",
      shortTitle: "プロ入門A",
      professorId: "P04", // 田中 (1年Aクラス分割・PC演習室)
      cohorts: ["Y1"],
      category: "lab_exercise",
      enrollment: 65,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "pc_terminal"],
      requiredRoomType: "pc_lab",
      aliases: ["C05", "プログラミング入門演習A", "プロ入門A", "プログラミング入門A"],
    },
    {
      id: "C06",
      title: "プログラミング入門演習B",
      shortTitle: "プロ入門B",
      professorId: "P08", // 中村 (1年Bクラス分割・PC演習室)
      cohorts: ["Y1"],
      category: "lab_exercise",
      enrollment: 60,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "pc_terminal"],
      requiredRoomType: "pc_lab",
      aliases: ["C06", "プログラミング入門演習B", "プロ入門B", "プログラミング入門B"],
    },
    {
      id: "C07",
      title: "情報倫理と法制度",
      shortTitle: "情報倫理",
      professorId: "P10", // 加藤 (非常勤: 水・金のみ)
      cohorts: ["Y1"],
      category: "elective_core",
      enrollment: 110,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C07", "情報倫理と法制度", "情報倫理"],
    },

    // ==================== 2年次 (Y2: 115名) ====================
    {
      id: "C08",
      title: "アルゴリズムとデータ構造",
      shortTitle: "アルゴリズム",
      professorId: "P03", // 高橋 (週2コマ)
      cohorts: ["Y2"],
      category: "compulsory",
      enrollment: 115,
      sessionsPerWeek: 2,
      requiredEquipment: ["projector", "mic", "recording"],
      aliases: ["C08", "アルゴリズムとデータ構造", "アルゴリズム"],
    },
    {
      id: "C09",
      title: "確率・統計学",
      shortTitle: "確率・統計",
      professorId: "P06", // 渡辺
      cohorts: ["Y2"],
      category: "compulsory",
      enrollment: 110,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C09", "確率・統計学", "確率・統計", "確率統計"],
    },
    {
      id: "C10",
      title: "オペレーティングシステム",
      shortTitle: "OS",
      professorId: "P07", // 山本
      cohorts: ["Y2"],
      category: "compulsory",
      enrollment: 80,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C10", "オペレーティングシステム", "OS"],
    },
    {
      id: "C11",
      title: "データベースシステム",
      shortTitle: "データベース",
      professorId: "P05", // 伊藤
      cohorts: ["Y2"],
      category: "elective_core",
      enrollment: 75,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C11", "データベースシステム", "データベース", "DB"],
    },
    {
      id: "C12",
      title: "ソフトウェア設計演習",
      shortTitle: "SW設計演習",
      professorId: "P04", // 田中 (週2コマ・PC演習室)
      cohorts: ["Y2"],
      category: "lab_exercise",
      enrollment: 65,
      sessionsPerWeek: 2,
      requiredEquipment: ["projector", "pc_terminal"],
      requiredRoomType: "pc_lab",
      aliases: ["C12", "ソフトウェア設計演習", "SW設計演習", "ソフト設計演習"],
    },
    {
      id: "C13",
      title: "コンピュータネットワーク",
      shortTitle: "ネットワーク",
      professorId: "P05", // 伊藤
      cohorts: ["Y2"],
      category: "elective_core",
      enrollment: 70,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C13", "コンピュータネットワーク", "ネットワーク"],
    },
    {
      id: "C14",
      title: "ヒューマンコンピュータインタラクション",
      shortTitle: "HCI",
      professorId: "P08", // 中村
      cohorts: ["Y2"],
      category: "elective",
      enrollment: 65,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "moveable_desks"],
      aliases: ["C14", "ヒューマンコンピュータインタラクション", "HCI"],
    },

    // ==================== 3年次 (Y3: 95名) ====================
    {
      id: "C15",
      title: "数理最適化",
      shortTitle: "数理最適化",
      professorId: "P01", // 佐藤 (週2コマ)
      cohorts: ["Y3"],
      category: "compulsory",
      enrollment: 80,
      sessionsPerWeek: 2,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C15", "数理最適化", "最適化"],
    },
    {
      id: "C16",
      title: "機械学習",
      shortTitle: "機械学習",
      professorId: "P02", // 鈴木 (週2コマ)
      cohorts: ["Y3"],
      category: "compulsory",
      enrollment: 82,
      sessionsPerWeek: 2,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C16", "機械学習", "ML"],
    },
    {
      id: "C17",
      title: "自然言語処理",
      shortTitle: "自然言語処理",
      professorId: "P02", // 鈴木
      cohorts: ["Y3"],
      category: "elective_core",
      enrollment: 70,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C17", "自然言語処理", "NLP"],
    },
    {
      id: "C18",
      title: "情報セキュリティ",
      shortTitle: "セキュリティ",
      professorId: "P09", // 小林 (非常勤: 火・木のみ)
      cohorts: ["Y3"],
      category: "elective_core",
      enrollment: 75,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C18", "情報セキュリティ", "セキュリティ"],
    },
    {
      id: "C19",
      title: "データサイエンス実践演習",
      shortTitle: "DS実践演習",
      professorId: "P06", // 渡辺 (PC演習室)
      cohorts: ["Y3"],
      category: "lab_exercise",
      enrollment: 58,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "pc_terminal"],
      requiredRoomType: "pc_lab",
      aliases: ["C19", "データサイエンス実践演習", "DS実践演習", "DS演習"],
    },
    {
      id: "C20",
      title: "Webアプリケーション開発演習",
      shortTitle: "Web開発演習",
      professorId: "P08", // 中村 (PC演習室)
      cohorts: ["Y3"],
      category: "lab_exercise",
      enrollment: 55,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "pc_terminal"],
      requiredRoomType: "pc_lab",
      aliases: ["C20", "Webアプリケーション開発演習", "Web開発演習", "Web演習"],
    },
    {
      id: "C21",
      title: "クラウドコンピューティング実践",
      shortTitle: "クラウド実践",
      professorId: "P10", // 加藤 (非常勤: 水・金のみ)
      cohorts: ["Y3"],
      category: "elective",
      enrollment: 65,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C21", "クラウドコンピューティング実践", "クラウド実践", "クラウド"],
    },
    {
      id: "C22",
      title: "暗号理論とブロックチェーン",
      shortTitle: "暗号理論",
      professorId: "P09", // 小林 (非常勤: 火・木のみ)
      cohorts: ["Y3", "Y4"],
      category: "elective",
      enrollment: 40,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector"],
      aliases: ["C22", "暗号理論とブロックチェーン", "暗号理論"],
    },

    // ==================== 4年次・院 (Y4: 45名) ====================
    {
      id: "C23",
      title: "数理最適化ゼミ",
      shortTitle: "最適化ゼミ",
      professorId: "P01", // 佐藤
      cohorts: ["Y4"],
      category: "seminar",
      enrollment: 25,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "moveable_desks"],
      preferredRoomIds: ["R401"],
      aliases: ["C23", "数理最適化ゼミ", "最適化ゼミ", "佐藤ゼミ"],
    },
    {
      id: "C24",
      title: "人工知能・NLPゼミ",
      shortTitle: "AI・NLPゼミ",
      professorId: "P02", // 鈴木
      cohorts: ["Y4"],
      category: "seminar",
      enrollment: 28,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "moveable_desks"],
      preferredRoomIds: ["R401"],
      aliases: ["C24", "人工知能・NLPゼミ", "AI・NLPゼミ", "鈴木ゼミ"],
    },
    {
      id: "C25",
      title: "システムソフトウェア輪講",
      shortTitle: "システム輪講",
      professorId: "P05", // 伊藤
      cohorts: ["Y4"],
      category: "seminar",
      enrollment: 24,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "moveable_desks"],
      preferredRoomIds: ["R401"],
      aliases: ["C25", "システムソフトウェア輪講", "システム輪講", "伊藤ゼミ"],
    },
  ];
}

export function generateTimetableState(
  configOverrides?: Partial<TimetableConfig>
): TimetableState {
  const config = createDefaultTimetableConfig(configOverrides);
  const rooms = createDefaultRooms();
  const professors = createDefaultProfessors();
  const courses = createDefaultCourses();

  // Include one realistic default custom rule so the user can see how custom rules work out of the box
  const customRules: CustomTimetableRule[] = [
    {
      id: "rule_default_1",
      kind: "course_precedence",
      enabled: true,
      isHard: true,
      courseId: "C05",
      secondCourseId: "C06",
      description: "カリキュラム順序: プログラミング入門演習A(C05)は演習B(C06)と同じ曜日またはより前の曜日に開講",
    },
  ];

  return {
    config,
    rooms,
    professors,
    courses,
    customRules,
  };
}

/**
 * Creates an empty/blank timetable state (no courses, rooms, or professors)
 * Used as the default starting state or when the user clears/resets to blank.
 */
export function createBlankTimetableState(
  configOverrides?: Partial<TimetableConfig>
): TimetableState {
  return {
    config: createDefaultTimetableConfig(configOverrides),
    rooms: [],
    professors: [],
    courses: [],
    customRules: [],
  };
}

/**
 * Injects a realistic conflict scenario to showcase WaSHI (HiGHS) conflict diagnosis (Elastic IIS).
 */
export function injectTimetableConflictScenario(
  state: TimetableState,
  scenario: "room_double_book" | "prof_impossible_day" | "pc_lab_overload"
): { updatedState: TimetableState; descriptionJa: string } {
  const nextRules = state.customRules.filter((r) => !r.id.startsWith("conflict_demo_"));

  if (scenario === "room_double_book") {
    // Force two 1st-year large courses (C01: 135 students, C02: 130 students) that both require R101 (capacity 150, the only room >= 125) into Tue Period 2!
    nextRules.push(
      {
        id: "conflict_demo_r101_c01",
        kind: "pin_slot",
        enabled: true,
        isHard: true,
        courseId: "C01",
        days: ["Tue"],
        periods: [2],
        roomId: "R101",
        description: "【矛盾デモ】情報科学概論(C01・135名)を 火曜2限・101大講義室(R101) に固定",
      },
      {
        id: "conflict_demo_r101_c02",
        kind: "pin_slot",
        enabled: true,
        isHard: true,
        courseId: "C02",
        days: ["Tue"],
        periods: [2],
        roomId: "R101",
        description: "【矛盾デモ】線形代数学I(C02・130名)も 火曜2限・101大講義室(R101) に固定",
      }
    );
    return {
      updatedState: { ...state, customRules: nextRules },
      descriptionJa:
        "130名超の大規模必修科目「情報科学概論(C01)」と「線形代数学I(C02)」の両方を【火曜2限・101大講義室】に強制固定しました（教室重複＆1年次必修重複）。",
    };
  }

  if (scenario === "prof_impossible_day") {
    // Adjunct Prof P09 (小林 拓海: only available Tue/Thu) -> force C18 (情報セキュリティ) onto Monday Period 3!
    nextRules.push({
      id: "conflict_demo_adjunct_mon",
      kind: "pin_slot",
      enabled: true,
      isHard: true,
      courseId: "C18",
      days: ["Mon"],
      periods: [3],
      description:
        "【矛盾デモ】非常勤(火・木のみ出講可)の小林先生が担当する「情報セキュリティ(C18)」を月曜3限に固定",
    });
    return {
      updatedState: { ...state, customRules: nextRules },
      descriptionJa:
        "火曜・木曜のみ出講可能な非常勤講師（小林先生）の担当科目「情報セキュリティ(C18)」を【月曜3限】に強制固定しました。",
    };
  }

  // scenario === "pc_lab_overload"
  // Close both PC labs (R301 and R302) on Tue, Wed, Thu, Fri, AND force 3 PC lab courses into Monday Period 2 (only 2 PC labs exist!)
  nextRules.push(
    {
      id: "conflict_demo_pclab_1",
      kind: "pin_slot",
      enabled: true,
      isHard: true,
      courseId: "C05",
      days: ["Mon"],
      periods: [2],
      description: "【矛盾デモ】プログラミング入門演習A(C05・PC室必須)を月曜2限に固定",
    },
    {
      id: "conflict_demo_pclab_2",
      kind: "pin_slot",
      enabled: true,
      isHard: true,
      courseId: "C06",
      days: ["Mon"],
      periods: [2],
      description: "【矛盾デモ】プログラミング入門演習B(C06・PC室必須)を月曜2限に固定",
    },
    {
      id: "conflict_demo_pclab_3",
      kind: "pin_slot",
      enabled: true,
      isHard: true,
      courseId: "C19",
      days: ["Mon"],
      periods: [2],
      description: "【矛盾デモ】データサイエンス実践演習(C19・PC室必須)も月曜2限に固定",
    }
  );
  return {
    updatedState: { ...state, customRules: nextRules },
    descriptionJa:
      "PC演習室が2室（301・302）しかない状態で、PC演習室必須の3科目（C05, C06, C19）すべてを【月曜2限】に同時固定しました。",
  };
}
