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
      name: "101 Large Lecture Hall",
      shortName: "101 Large",
      building: "CS Bldg 1F",
      capacity: 150,
      roomType: "large_hall",
      equipment: ["projector", "mic", "recording"],
      aliases: ["R101", "101", "101 Large"],
    },
    {
      id: "R102",
      name: "102 Large Lecture Hall",
      shortName: "102 Large",
      building: "CS Bldg 1F",
      capacity: 120,
      roomType: "large_hall",
      equipment: ["projector", "mic", "recording"],
      aliases: ["R102", "102", "102 Large"],
    },
    {
      id: "R201",
      name: "201 Medium Classroom",
      shortName: "201 Med",
      building: "CS Bldg 2F",
      capacity: 85,
      roomType: "medium_room",
      equipment: ["projector", "mic", "moveable_desks"],
      aliases: ["R201", "201", "201 Med"],
    },
    {
      id: "R202",
      name: "202 Medium Classroom",
      shortName: "202 Med",
      building: "CS Bldg 2F",
      capacity: 75,
      roomType: "medium_room",
      equipment: ["projector", "mic", "moveable_desks"],
      aliases: ["R202", "202", "202 Med"],
    },
    {
      id: "R301",
      name: "301 PC Lab A",
      shortName: "301PC-A",
      building: "CS Bldg 3F",
      capacity: 70,
      roomType: "pc_lab",
      equipment: ["projector", "mic", "pc_terminal", "recording"],
      aliases: ["R301", "301", "301PC", "PC Lab A"],
    },
    {
      id: "R302",
      name: "302 PC Lab B",
      shortName: "302PC-B",
      building: "CS Bldg 3F",
      capacity: 60,
      roomType: "pc_lab",
      equipment: ["projector", "mic", "pc_terminal"],
      aliases: ["R302", "302", "302PC", "PC Lab B"],
    },
    {
      id: "R401",
      name: "401 Seminar Room",
      shortName: "401Sem",
      building: "CS Bldg 4F",
      capacity: 40,
      roomType: "seminar_room",
      equipment: ["projector", "moveable_desks"],
      aliases: ["R401", "401", "401 Seminar", "401 Seminar Room", "Seminar Room"],
    },
  ];
}

export function createDefaultProfessors(): ProfessorProfile[] {
  return [
    {
      id: "P01",
      name: "Kenichi Sato",
      kana: "Sato Kenichi",
      title: "Professor",
      employment: "full_time",
      specialty: "Mathematical Optimization & Operations Research",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Wed", period: 5, reason: "Faculty Meeting" },
      ],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
    {
      id: "P02",
      name: "Misaki Suzuki",
      kana: "Suzuki Misaki",
      title: "Professor",
      specialty: "Machine Learning & Natural Language Processing",
      employment: "full_time",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Wed", period: 5, reason: "Faculty Meeting" },
        { day: "Mon", period: 1, reason: "Joint Research Sync" },
      ],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
    {
      id: "P03",
      name: "Makoto Takahashi",
      kana: "Takahashi Makoto",
      title: "Professor",
      employment: "full_time",
      specialty: "Algorithms & Discrete Mathematics",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Wed", period: 5, reason: "Faculty Meeting" },
      ],
      avoidPeriod1: false,
      avoidPeriod5: true,
      maxSessionsPerDay: 2,
    },
    {
      id: "P04",
      name: "Ayano Tanaka",
      kana: "Tanaka Ayano",
      title: "Associate Professor",
      employment: "full_time",
      specialty: "Software Engineering & Programming Languages",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Fri", period: 5, reason: "Childcare Pickup" },
      ],
      avoidPeriod1: false,
      avoidPeriod5: true,
      maxSessionsPerDay: 3,
    },
    {
      id: "P05",
      name: "Daisuke Ito",
      kana: "Ito Daisuke",
      title: "Associate Professor",
      employment: "full_time",
      specialty: "Databases & Distributed Systems",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Tue", period: 1, reason: "IT Infrastructure Committee" },
      ],
      avoidPeriod1: false,
      avoidPeriod5: false,
      maxSessionsPerDay: 3,
    },
    {
      id: "P06",
      name: "Yui Watanabe",
      kana: "Watanabe Yui",
      title: "Associate Professor",
      employment: "full_time",
      specialty: "Statistical Data Science & Data Mining",
      unavailableDays: [],
      unavailableSlots: [],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
    {
      id: "P07",
      name: "Shota Yamamoto",
      kana: "Yamamoto Shota",
      title: "Lecturer",
      employment: "full_time",
      specialty: "Computer Systems & Foundations of CS",
      unavailableDays: [],
      unavailableSlots: [],
      avoidPeriod1: false,
      avoidPeriod5: false,
      maxSessionsPerDay: 3,
    },
    {
      id: "P08",
      name: "Rin Nakamura",
      kana: "Nakamura Rin",
      title: "Lecturer",
      employment: "full_time",
      specialty: "HCI & Interactive Web Engineering",
      unavailableDays: [],
      unavailableSlots: [
        { day: "Thu", period: 1, reason: "Medical Appointment" },
      ],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
    {
      id: "P09",
      name: "Takumi Kobayashi",
      kana: "Kobayashi Takumi",
      title: "Adjunct Lecturer",
      employment: "adjunct",
      specialty: "Information Security & Cryptography (Head of Security Research Lab)",
      // Adjunct: only available Tue & Thu
      unavailableDays: ["Mon", "Wed", "Fri"],
      unavailableSlots: [
        { day: "Tue", period: 1, reason: "HQ Duty (P2+ Preferred)" },
      ],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
    {
      id: "P10",
      name: "Yuna Kato",
      kana: "Kato Yuna",
      title: "Adjunct Lecturer",
      employment: "adjunct",
      specialty: "Cloud Architecture & Information Ethics (Tech VPoE)",
      // Adjunct: only available Wed & Fri
      unavailableDays: ["Mon", "Tue", "Thu"],
      unavailableSlots: [
        { day: "Wed", period: 1, reason: "Commute Time (No P1)" },
        { day: "Fri", period: 1, reason: "Commute Time (No P1)" },
      ],
      avoidPeriod1: true,
      avoidPeriod5: false,
      maxSessionsPerDay: 2,
    },
  ];
}

export function createDefaultCourses(): CourseProfile[] {
  return [
    // ==================== Year 1 (Y1: 135 students) ====================
    {
      id: "C01",
      title: "Intro to Computer Science",
      shortTitle: "Intro CS",
      professorId: "P07", // Yamamoto
      cohorts: ["Y1"],
      category: "compulsory",
      enrollment: 135,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C01", "Intro to Computer Science", "Intro CS"],
    },
    {
      id: "C02",
      title: "Linear Algebra I",
      shortTitle: "Linear Alg I",
      professorId: "P01", // Sato (2 sessions/week)
      cohorts: ["Y1"],
      category: "compulsory",
      enrollment: 130,
      sessionsPerWeek: 2,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C02", "Linear Algebra I", "Linear Alg I"],
    },
    {
      id: "C03",
      title: "Calculus I",
      shortTitle: "Calculus I",
      professorId: "P06", // Watanabe
      cohorts: ["Y1"],
      category: "compulsory",
      enrollment: 125,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C03", "Calculus I"],
    },
    {
      id: "C04",
      title: "Discrete Mathematics",
      shortTitle: "Discrete Math",
      professorId: "P03", // Takahashi
      cohorts: ["Y1"],
      category: "compulsory",
      enrollment: 115,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C04", "Discrete Mathematics", "Discrete Math"],
    },
    {
      id: "C05",
      title: "Intro Programming Lab A",
      shortTitle: "Prog Lab A",
      professorId: "P04", // Tanaka (Year 1 Class A, PC Lab)
      cohorts: ["Y1"],
      category: "lab_exercise",
      enrollment: 65,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "pc_terminal"],
      requiredRoomType: "pc_lab",
      aliases: ["C05", "Intro Programming Lab A", "Prog Lab A"],
    },
    {
      id: "C06",
      title: "Intro Programming Lab B",
      shortTitle: "Prog Lab B",
      professorId: "P08", // Nakamura (Year 1 Class B, PC Lab)
      cohorts: ["Y1"],
      category: "lab_exercise",
      enrollment: 60,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "pc_terminal"],
      requiredRoomType: "pc_lab",
      aliases: ["C06", "Intro Programming Lab B", "Prog Lab B"],
    },
    {
      id: "C07",
      title: "Information Ethics & Law",
      shortTitle: "Info Ethics",
      professorId: "P10", // Kato (Adjunct: Wed/Fri only)
      cohorts: ["Y1"],
      category: "elective_core",
      enrollment: 110,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C07", "Information Ethics & Law", "Info Ethics"],
    },

    // ==================== Year 2 (Y2: 115 students) ====================
    {
      id: "C08",
      title: "Algorithms & Data Structures",
      shortTitle: "Algorithms",
      professorId: "P03", // Takahashi (2 sessions/week)
      cohorts: ["Y2"],
      category: "compulsory",
      enrollment: 115,
      sessionsPerWeek: 2,
      requiredEquipment: ["projector", "mic", "recording"],
      aliases: ["C08", "Algorithms & Data Structures", "Algorithms"],
    },
    {
      id: "C09",
      title: "Probability & Statistics",
      shortTitle: "Prob & Stat",
      professorId: "P06", // Watanabe
      cohorts: ["Y2"],
      category: "compulsory",
      enrollment: 110,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C09", "Probability & Statistics", "Prob & Stat"],
    },
    {
      id: "C10",
      title: "Operating Systems",
      shortTitle: "OS",
      professorId: "P07", // Yamamoto
      cohorts: ["Y2"],
      category: "compulsory",
      enrollment: 80,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C10", "Operating Systems", "OS"],
    },
    {
      id: "C11",
      title: "Database Systems",
      shortTitle: "Databases",
      professorId: "P05", // Ito
      cohorts: ["Y2"],
      category: "elective_core",
      enrollment: 75,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C11", "Database Systems", "Databases", "DB"],
    },
    {
      id: "C12",
      title: "Software Design Lab",
      shortTitle: "SW Design Lab",
      professorId: "P04", // Tanaka (2 sessions/week, PC Lab)
      cohorts: ["Y2"],
      category: "lab_exercise",
      enrollment: 65,
      sessionsPerWeek: 2,
      requiredEquipment: ["projector", "pc_terminal"],
      requiredRoomType: "pc_lab",
      aliases: ["C12", "Software Design Lab", "SW Design Lab"],
    },
    {
      id: "C13",
      title: "Computer Networks",
      shortTitle: "Networks",
      professorId: "P05", // Ito
      cohorts: ["Y2"],
      category: "elective_core",
      enrollment: 70,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C13", "Computer Networks", "Networks"],
    },
    {
      id: "C14",
      title: "Human-Computer Interaction",
      shortTitle: "HCI",
      professorId: "P08", // Nakamura
      cohorts: ["Y2"],
      category: "elective",
      enrollment: 65,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "moveable_desks"],
      aliases: ["C14", "Human-Computer Interaction", "HCI"],
    },

    // ==================== Year 3 (Y3: 95 students) ====================
    {
      id: "C15",
      title: "Mathematical Optimization",
      shortTitle: "Optimization",
      professorId: "P01", // Sato (2 sessions/week)
      cohorts: ["Y3"],
      category: "compulsory",
      enrollment: 80,
      sessionsPerWeek: 2,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C15", "Mathematical Optimization", "Optimization"],
    },
    {
      id: "C16",
      title: "Machine Learning",
      shortTitle: "ML",
      professorId: "P02", // Suzuki (2 sessions/week)
      cohorts: ["Y3"],
      category: "compulsory",
      enrollment: 82,
      sessionsPerWeek: 2,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C16", "Machine Learning", "ML"],
    },
    {
      id: "C17",
      title: "Natural Language Processing",
      shortTitle: "NLP",
      professorId: "P02", // Suzuki
      cohorts: ["Y3"],
      category: "elective_core",
      enrollment: 70,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C17", "Natural Language Processing", "NLP"],
    },
    {
      id: "C18",
      title: "Information Security",
      shortTitle: "Security",
      professorId: "P09", // Kobayashi (Adjunct: Tue/Thu only)
      cohorts: ["Y3"],
      category: "elective_core",
      enrollment: 75,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C18", "Information Security", "Security"],
    },
    {
      id: "C19",
      title: "Practical Data Science Lab",
      shortTitle: "Data Sci Lab",
      professorId: "P06", // Watanabe (PC Lab)
      cohorts: ["Y3"],
      category: "lab_exercise",
      enrollment: 58,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "pc_terminal"],
      requiredRoomType: "pc_lab",
      aliases: ["C19", "Practical Data Science Lab", "Data Sci Lab"],
    },
    {
      id: "C20",
      title: "Web App Development Lab",
      shortTitle: "Web Dev Lab",
      professorId: "P08", // Nakamura (PC Lab)
      cohorts: ["Y3"],
      category: "lab_exercise",
      enrollment: 55,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "pc_terminal"],
      requiredRoomType: "pc_lab",
      aliases: ["C20", "Web App Development Lab", "Web Dev Lab"],
    },
    {
      id: "C21",
      title: "Cloud Computing in Practice",
      shortTitle: "Cloud Practice",
      professorId: "P10", // Kato (Adjunct: Wed/Fri only)
      cohorts: ["Y3"],
      category: "elective",
      enrollment: 65,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "mic"],
      aliases: ["C21", "Cloud Computing in Practice", "Cloud Practice"],
    },
    {
      id: "C22",
      title: "Cryptography & Blockchain",
      shortTitle: "Crypto & BC",
      professorId: "P09", // Kobayashi (Adjunct: Tue/Thu only)
      cohorts: ["Y3", "Y4"],
      category: "elective",
      enrollment: 40,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector"],
      aliases: ["C22", "Cryptography & Blockchain", "Crypto & BC"],
    },

    // ==================== Year 4 / Graduate (Y4: 45 students) ====================
    {
      id: "C23",
      title: "Optimization Seminar",
      shortTitle: "Opt Seminar",
      professorId: "P01", // Sato
      cohorts: ["Y4"],
      category: "seminar",
      enrollment: 25,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "moveable_desks"],
      preferredRoomIds: ["R401"],
      aliases: ["C23", "Optimization Seminar", "Opt Seminar", "Sato Seminar"],
    },
    {
      id: "C24",
      title: "AI & NLP Seminar",
      shortTitle: "AI Seminar",
      professorId: "P02", // Suzuki
      cohorts: ["Y4"],
      category: "seminar",
      enrollment: 28,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "moveable_desks"],
      preferredRoomIds: ["R401"],
      aliases: ["C24", "AI & NLP Seminar", "AI Seminar", "Suzuki Seminar"],
    },
    {
      id: "C25",
      title: "System Software Colloquium",
      shortTitle: "System Collog",
      professorId: "P05", // Ito
      cohorts: ["Y4"],
      category: "seminar",
      enrollment: 24,
      sessionsPerWeek: 1,
      requiredEquipment: ["projector", "moveable_desks"],
      preferredRoomIds: ["R401"],
      aliases: ["C25", "System Software Colloquium", "System Collog", "Ito Seminar"],
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
      description: "Curriculum Order: Schedule Intro Programming Lab A (C05) on the same day or an earlier day than Lab B (C06)",
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
        description: "[Conflict Demo] Pin Intro to Computer Science (C01, 135 students) to Tue P2 in 101 Large Hall (R101)",
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
        description: "[Conflict Demo] Pin Linear Algebra I (C02, 130 students) to Tue P2 in 101 Large Hall (R101)",
      }
    );
    return {
      updatedState: { ...state, customRules: nextRules },
      descriptionJa:
        "Forced both large 130+ student courses Intro to Computer Science (C01) and Linear Algebra I (C02) into Tue P2 in 101 Large Hall (R101), causing room double-booking and cohort time conflicts.",
    };
  }

  if (scenario === "prof_impossible_day") {
    // Adjunct Prof P09 (Takumi Kobayashi: only available Tue/Thu) -> force C18 (Information Security) onto Monday Period 3!
    nextRules.push({
      id: "conflict_demo_adjunct_mon",
      kind: "pin_slot",
      enabled: true,
      isHard: true,
      courseId: "C18",
      days: ["Mon"],
      periods: [3],
      description:
        "[Conflict Demo] Pin Information Security (C18) taught by adjunct Prof. Kobayashi (Tue/Thu only) to Mon P3",
    });
    return {
      updatedState: { ...state, customRules: nextRules },
      descriptionJa:
        "Forced course Information Security (C18) taught by adjunct Prof. Kobayashi (available Tue/Thu only) onto Mon P3.",
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
      description: "[Conflict Demo] Pin Intro Programming Lab A (C05, PC lab required) to Mon P2",
    },
    {
      id: "conflict_demo_pclab_2",
      kind: "pin_slot",
      enabled: true,
      isHard: true,
      courseId: "C06",
      days: ["Mon"],
      periods: [2],
      description: "[Conflict Demo] Pin Intro Programming Lab B (C06, PC lab required) to Mon P2",
    },
    {
      id: "conflict_demo_pclab_3",
      kind: "pin_slot",
      enabled: true,
      isHard: true,
      courseId: "C19",
      days: ["Mon"],
      periods: [2],
      description: "[Conflict Demo] Pin Practical Data Science Lab (C19, PC lab required) to Mon P2",
    }
  );
  return {
    updatedState: { ...state, customRules: nextRules },
    descriptionJa:
      "With only 2 PC labs available (301 & 302), simultaneously pinned 3 PC-lab required courses (C05, C06, C19) to Mon P2.",
  };
}
