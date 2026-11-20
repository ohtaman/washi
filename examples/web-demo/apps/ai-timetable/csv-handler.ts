import enCatalog from "./locales/en.json" with { type: "json" };
import jaCatalog from "./locales/ja.json" with { type: "json" };
import zhCatalog from "./locales/zh.json" with { type: "json" };

interface CsvCatalogSection {
  [field: string]: string[] | undefined;
}

interface CsvCatalog {
  professors?: CsvCatalogSection;
  rooms?: CsvCatalogSection;
  courses?: CsvCatalogSection;
  tokens?: Record<string, string[] | undefined>;
}

const ALL_CSV_CATALOGS: CsvCatalog[] = [enCatalog.csv, jaCatalog.csv, zhCatalog.csv];

function matchesHeader(h: string, field: string, section: "professors" | "rooms" | "courses"): boolean {
  for (const cat of ALL_CSV_CATALOGS) {
    const list = cat[section]?.[field];
    if (list && list.includes(h)) return true;
  }
  return false;
}

function matchesToken(t: string, tokenKey: string): boolean {
  const normalized = t.trim().toLowerCase();
  for (const cat of ALL_CSV_CATALOGS) {
    const list = cat.tokens?.[tokenKey];
    if (list && list.some((k: string) => normalized === k.toLowerCase())) return true;
  }
  return false;
}
import {
  type CohortId,
  type CourseCategory,
  type CourseProfile,
  type ProfessorEmploymentType,
  type ProfessorProfile,
  type RoomEquipment,
  type RoomProfile,
  type RoomType,
  type TimetableDay,
  type TimetablePeriod,
} from "./types";
import {
  createDefaultCourses,
  createDefaultProfessors,
  createDefaultRooms,
} from "./generator";

// Simple RFC 4180 compliant CSV line tokenizer
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip empty lines or pure comments when not in quotes
    if (!inQuotes && (line.trim() === "" || line.trim().startsWith("#"))) {
      continue;
    }

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (inQuotes) {
        if (char === '"') {
          if (j + 1 < line.length && line[j + 1] === '"') {
            currentField += '"';
            j++; // Skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          currentRow.push(currentField.trim());
          currentField = "";
        } else {
          currentField += char;
        }
      }
    }

    if (inQuotes) {
      currentField += "\n";
    } else {
      currentRow.push(currentField.trim());
      currentField = "";
      if (currentRow.length > 0 && currentRow.some((col) => col !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
    }
  }

  if (currentRow.length > 0 && currentRow.some((col) => col !== "")) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-()\uFF08\uFF09\u30FB]/g, "");
}

function parseDayToken(token: string): TimetableDay | null {
  const t = token.trim().toLowerCase();
  if (t === "mon" || t === "月" || t === "月曜" || t === "月曜日") return "Mon";
  if (t === "tue" || t === "火" || t === "火曜" || t === "火曜日") return "Tue";
  if (t === "wed" || t === "水" || t === "水曜" || t === "水曜日") return "Wed";
  if (t === "thu" || t === "木" || t === "木曜" || t === "木曜日") return "Thu";
  if (t === "fri" || t === "金" || t === "金曜" || t === "金曜日") return "Fri";
  return null;
}

export function parseSlotToken(token: string): {
  day: TimetableDay;
  period: TimetablePeriod;
  reason?: string;
} | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /^([A-Za-z]+|[月火水木金](?:曜)?(?:日)?)[-_:\s]*([1-5])(?:限)?(?:\s*[\(（](.*)[\)）])?$/
  );
  if (!match) return null;
  const day = parseDayToken(match[1]);
  if (!day) return null;
  const period = Number(match[2]) as TimetablePeriod;
  if (period < 1 || period > 5) return null;
  const reason = match[3]?.trim();
  return { day, period, ...(reason ? { reason } : {}) };
}

function parseCohortToken(token: string): CohortId | null {
  const t = token.trim().toUpperCase();
  if (t === "Y1" || t === "1" || t === "1年" || t === "1年次" || t === "B1") return "Y1";
  if (t === "Y2" || t === "2" || t === "2年" || t === "2年次" || t === "B2") return "Y2";
  if (t === "Y3" || t === "3" || t === "3年" || t === "3年次" || t === "B3") return "Y3";
  if (t === "Y4" || t === "4" || t === "4年" || t === "4年次" || t === "B4") return "Y4";
  return null;
}

function parseRoomTypeToken(token: string): RoomType | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (matchesToken(t, "large_hall")) return "large_hall";
  if (matchesToken(t, "medium_room")) return "medium_room";
  if (matchesToken(t, "pc_lab")) return "pc_lab";
  if (matchesToken(t, "seminar_room")) return "seminar_room";
  return null;
}

function parseCategoryToken(token: string): CourseCategory | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (matchesToken(t, "compulsory")) return "compulsory";
  if (matchesToken(t, "elective_core")) return "elective_core";
  if (matchesToken(t, "lab_exercise")) return "lab_exercise";
  if (matchesToken(t, "seminar")) return "seminar";
  if (matchesToken(t, "elective")) return "elective";
  return null;
}

function parseEmploymentToken(token: string): ProfessorEmploymentType | null {
  const t = token.trim().toLowerCase();
  if (
    t === "full_time" ||
    t === "full-time" ||
    t === "full time" ||
    t === "regular" ||
    t === "常勤" ||
    t === "専任" ||
    t === "全职" ||
    t === "专任"
  ) {
    return "full_time";
  }
  if (
    t === "adjunct" ||
    t === "part_time" ||
    t === "part-time" ||
    t === "part time" ||
    t === "非常勤" ||
    t === "非常勤講師" ||
    t === "外聘" ||
    t === "外聘讲师" ||
    t === "兼职"
  ) {
    return "adjunct";
  }
  return null;
}

function parseBooleanToken(token: string): boolean | null {
  const t = token.trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes" || t === "on" || t === "要" || t === "回避" || t === "是") {
    return true;
  }
  if (t === "false" || t === "0" || t === "no" || t === "off" || t === "不要" || t === "否") {
    return false;
  }
  return null;
}

function parseEquipmentToken(token: string): RoomEquipment | null {
  const t = token.trim().toLowerCase();
  if (matchesToken(t, "projector")) return "projector";
  if (matchesToken(t, "mic")) return "mic";
  if (matchesToken(t, "pc_terminal")) return "pc_terminal";
  if (matchesToken(t, "moveable_desks")) return "moveable_desks";
  if (matchesToken(t, "recording")) return "recording";
  return null;
}

// -------------------------------------------------------------
// 1. PROFESSORS CSV
// -------------------------------------------------------------
export function parseProfessorsCsv(csvText: string): {
  professors: ProfessorProfile[];
  errors: string[];
} {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return { professors: [], errors: ["Faculty CSV has no data rows (header + at least 1 row required)"] };
  }

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);
  const idIdx = headers.findIndex((h) => matchesHeader(h, "id", "professors"));
  const nameIdx = headers.findIndex((h) => matchesHeader(h, "name", "professors"));
  const titleIdx = headers.findIndex((h) => matchesHeader(h, "title", "professors"));
  const empIdx = headers.findIndex((h) => matchesHeader(h, "employment", "professors"));
  const unavailIdx = headers.findIndex((h) => matchesHeader(h, "unavailableDays", "professors"));
  const slotIdx = headers.findIndex((h) => matchesHeader(h, "unavailableSlots", "professors"));
  const p1Idx = headers.findIndex((h) => matchesHeader(h, "avoidPeriod1", "professors"));
  const p5Idx = headers.findIndex((h) => matchesHeader(h, "avoidPeriod5", "professors"));
  const maxIdx = headers.findIndex((h) => matchesHeader(h, "maxSessionsPerDay", "professors"));

  if (idIdx === -1 || nameIdx === -1) {
    return {
      professors: [],
      errors: ["Faculty CSV requires 'id' and 'name' columns."],
    };
  }

  const professors: ProfessorProfile[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = row[idIdx]?.trim();
    const name = row[nameIdx]?.trim();
    if (!id || !name) {
      errors.push(`Row ${r + 1}: ID or name is empty`);
      continue;
    }
    if (seenIds.has(id)) {
      errors.push(`Row ${r + 1}: Duplicate faculty ID '${id}'`);
      continue;
    }
    seenIds.add(id);

    const title = titleIdx !== -1 ? (row[titleIdx] ?? "").trim() : "講師";

    let employment: ProfessorEmploymentType = "full_time";
    if (empIdx !== -1) {
      const parsedEmp = parseEmploymentToken(row[empIdx] ?? "");
      if (!parsedEmp) {
        errors.push(`Row ${r + 1} (${name}): Invalid employment value '${row[empIdx] ?? ""}'`);
        continue;
      }
      employment = parsedEmp;
    }

    const unavailableDays: TimetableDay[] = [];
    let hasInvalidDay = false;
    if (unavailIdx !== -1 && (row[unavailIdx] ?? "").trim() !== "") {
      const tokens = row[unavailIdx].split(/[;,\/]/);
      for (const tok of tokens) {
        const trimmedTok = tok.trim();
        const d = trimmedTok ? parseDayToken(trimmedTok) : null;
        if (!d) {
          errors.push(`Row ${r + 1} (${name}): Invalid unavailable day token '${trimmedTok}'`);
          hasInvalidDay = true;
          break;
        }
        if (!unavailableDays.includes(d)) {
          unavailableDays.push(d);
        }
      }
    }
    if (hasInvalidDay) continue;

    const unavailableSlots: Array<{ day: TimetableDay; period: TimetablePeriod; reason?: string }> = [];
    let hasInvalidSlot = false;
    if (slotIdx !== -1 && (row[slotIdx] ?? "").trim() !== "") {
      const tokens = row[slotIdx].split(";");
      for (const tok of tokens) {
        const trimmedTok = tok.trim();
        const slot = trimmedTok ? parseSlotToken(trimmedTok) : null;
        if (!slot) {
          errors.push(`Row ${r + 1} (${name}): Invalid unavailable slot token '${trimmedTok}'`);
          hasInvalidSlot = true;
          break;
        }
        unavailableSlots.push(slot);
      }
    }
    if (hasInvalidSlot) continue;

    let avoidP1 = false;
    if (p1Idx !== -1) {
      const parsedP1 = parseBooleanToken(row[p1Idx] ?? "");
      if (parsedP1 === null) {
        errors.push(`Row ${r + 1} (${name}): Invalid avoidPeriod1 boolean '${row[p1Idx] ?? ""}'`);
        continue;
      }
      avoidP1 = parsedP1;
    }

    let avoidP5 = false;
    if (p5Idx !== -1) {
      const parsedP5 = parseBooleanToken(row[p5Idx] ?? "");
      if (parsedP5 === null) {
        errors.push(`Row ${r + 1} (${name}): Invalid avoidPeriod5 boolean '${row[p5Idx] ?? ""}'`);
        continue;
      }
      avoidP5 = parsedP5;
    }

    let maxSessions: number = employment === "adjunct" ? 3 : 2;
    if (maxIdx !== -1) {
      const maxRaw = (row[maxIdx] ?? "").trim();
      const maxNum = maxRaw === "" ? NaN : Number(maxRaw);
      if (!Number.isInteger(maxNum) || maxNum < 1 || maxNum > 5) {
        errors.push(`Row ${r + 1} (${name}): Invalid maxSessionsPerDay '${row[maxIdx] ?? ""}' (must be an integer 1–5)`);
        continue;
      }
      maxSessions = maxNum;
    }

    professors.push({
      id,
      name,
      kana: "",
      title,
      employment,
      specialty: "",
      unavailableDays,
      unavailableSlots,
      avoidPeriod1: avoidP1,
      avoidPeriod5: avoidP5,
      maxSessionsPerDay: maxSessions,
    });
  }

  return { professors, errors };
}

// -------------------------------------------------------------
// 2. ROOMS CSV
// -------------------------------------------------------------
export function parseRoomsCsv(csvText: string): {
  rooms: RoomProfile[];
  errors: string[];
} {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return { rooms: [], errors: ["Room CSV has no data rows (header + at least 1 row required)"] };
  }

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);
  const idIdx = headers.findIndex((h) => matchesHeader(h, "id", "rooms"));
  const nameIdx = headers.findIndex((h) => matchesHeader(h, "name", "rooms"));
  const capIdx = headers.findIndex((h) => matchesHeader(h, "capacity", "rooms"));
  const typeIdx = headers.findIndex((h) => matchesHeader(h, "roomType", "rooms"));
  const eqIdx = headers.findIndex((h) => matchesHeader(h, "equipment", "rooms"));
  const bldIdx = headers.findIndex((h) => matchesHeader(h, "building", "rooms"));

  if (idIdx === -1 || nameIdx === -1 || capIdx === -1) {
    return {
      rooms: [],
      errors: ["Room CSV requires 'id', 'name', and 'capacity' columns."],
    };
  }

  const rooms: RoomProfile[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = row[idIdx]?.trim();
    const name = row[nameIdx]?.trim();
    const capRaw = (row[capIdx] ?? "").trim();
    const capNum = capRaw === "" ? NaN : Number(capRaw);

    if (!id || !name || !Number.isInteger(capNum) || capNum <= 0) {
      errors.push(`Row ${r + 1}: ID, room name, or valid positive integer capacity is missing`);
      continue;
    }
    if (seenIds.has(id)) {
      errors.push(`Row ${r + 1}: Duplicate room ID '${id}'`);
      continue;
    }
    seenIds.add(id);

    let roomType: RoomType = "medium_room";
    if (typeIdx !== -1) {
      const parsedType = parseRoomTypeToken(row[typeIdx] ?? "");
      if (!parsedType) {
        errors.push(`Row ${r + 1} (${name}): Invalid roomType '${row[typeIdx] ?? ""}'`);
        continue;
      }
      roomType = parsedType;
    }

    const equipment: RoomEquipment[] = [];
    let hasInvalidEquipment = false;
    if (eqIdx !== -1 && (row[eqIdx] ?? "").trim() !== "") {
      const tokens = row[eqIdx].split(/[;,\/]/);
      for (const tok of tokens) {
        const trimmedTok = tok.trim();
        const eq = trimmedTok ? parseEquipmentToken(trimmedTok) : null;
        if (!eq) {
          errors.push(`Row ${r + 1} (${name}): Invalid equipment token '${trimmedTok}'`);
          hasInvalidEquipment = true;
          break;
        }
        if (!equipment.includes(eq)) {
          equipment.push(eq);
        }
      }
    }
    if (hasInvalidEquipment) continue;

    const building = bldIdx !== -1 && row[bldIdx] ? row[bldIdx].trim() : "";

    rooms.push({
      id,
      name,
      shortName: name.length > 8 ? name.slice(0, 8) : name,
      building,
      capacity: capNum,
      roomType,
      equipment,
      aliases: [id, name],
    });
  }

  return { rooms, errors };
}

// -------------------------------------------------------------
// 3. COURSES CSV
// -------------------------------------------------------------
export function parseCoursesCsv(
  csvText: string,
  knownProfIds?: Set<string>
): {
  courses: CourseProfile[];
  errors: string[];
} {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return { courses: [], errors: ["Course CSV has no data rows (header + at least 1 row required)"] };
  }

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);
  const idIdx = headers.findIndex((h) => matchesHeader(h, "id", "courses"));
  const titleIdx = headers.findIndex((h) => matchesHeader(h, "title", "courses"));
  const profIdx = headers.findIndex((h) => matchesHeader(h, "professorId", "courses"));
  const cohortIdx = headers.findIndex((h) => matchesHeader(h, "cohorts", "courses"));
  const catIdx = headers.findIndex((h) => matchesHeader(h, "category", "courses"));
  const enrollIdx = headers.findIndex((h) => matchesHeader(h, "enrollment", "courses"));
  const sesIdx = headers.findIndex((h) => matchesHeader(h, "sessionsPerWeek", "courses"));
  const eqIdx = headers.findIndex((h) => matchesHeader(h, "requiredEquipment", "courses"));
  const roomTypeIdx = headers.findIndex((h) => matchesHeader(h, "requiredRoomType", "courses"));

  if (idIdx === -1 || titleIdx === -1 || profIdx === -1) {
    return {
      courses: [],
      errors: ["Course CSV requires 'id', 'title', and 'professorId' columns."],
    };
  }

  const courses: CourseProfile[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = row[idIdx]?.trim();
    const title = row[titleIdx]?.trim();
    const professorId = row[profIdx]?.trim();

    if (!id || !title || !professorId) {
      errors.push(`Row ${r + 1}: ID, title, or professorId is empty`);
      continue;
    }

    if (seenIds.has(id)) {
      errors.push(`Row ${r + 1}: Duplicate course ID '${id}'`);
      continue;
    }
    seenIds.add(id);

    if (knownProfIds && knownProfIds.size > 0 && !knownProfIds.has(professorId)) {
      errors.push(`Row ${r + 1} (${title}): Professor ID '${professorId}' does not exist in faculty list`);
      continue;
    }

    const cohorts: CohortId[] = [];
    if (cohortIdx === -1) {
      cohorts.push("Y1");
    } else {
      const rawCohorts = (row[cohortIdx] ?? "").trim();
      if (!rawCohorts) {
        errors.push(`Row ${r + 1} (${title}): cohorts is empty`);
        continue;
      }
      const tokens = rawCohorts.split(/[;,\/]/);
      let hasInvalidCohort = false;
      for (const tok of tokens) {
        const trimmedTok = tok.trim();
        const c = trimmedTok ? parseCohortToken(trimmedTok) : null;
        if (!c) {
          errors.push(`Row ${r + 1} (${title}): Invalid cohort token '${trimmedTok}'`);
          hasInvalidCohort = true;
          break;
        }
        if (!cohorts.includes(c)) cohorts.push(c);
      }
      if (hasInvalidCohort || cohorts.length === 0) continue;
    }

    let category: CourseCategory = "elective";
    if (catIdx !== -1) {
      const parsedCategory = parseCategoryToken(row[catIdx] ?? "");
      if (!parsedCategory) {
        errors.push(`Row ${r + 1} (${title}): Invalid category '${row[catIdx] ?? ""}'`);
        continue;
      }
      category = parsedCategory;
    }

    let enrollment = 60;
    if (enrollIdx !== -1) {
      const enrollRaw = (row[enrollIdx] ?? "").trim();
      const enrollNum = enrollRaw === "" ? NaN : Number(enrollRaw);
      if (!Number.isInteger(enrollNum) || enrollNum <= 0) {
        errors.push(`Row ${r + 1} (${title}): Invalid enrollment '${row[enrollIdx] ?? ""}' (must be a positive integer)`);
        continue;
      }
      enrollment = enrollNum;
    }

    let sessionsPerWeek: 1 | 2 = 1;
    if (sesIdx !== -1) {
      const sesRaw = (row[sesIdx] ?? "").trim();
      const sesNum = sesRaw === "" ? NaN : Number(sesRaw);
      if (sesNum !== 1 && sesNum !== 2) {
        errors.push(`Row ${r + 1} (${title}): Invalid sessionsPerWeek '${row[sesIdx] ?? ""}' (must be 1 or 2)`);
        continue;
      }
      sessionsPerWeek = sesNum;
    }

    const requiredEquipment: RoomEquipment[] = [];
    let hasInvalidReqEquip = false;
    if (eqIdx !== -1 && (row[eqIdx] ?? "").trim() !== "") {
      const tokens = row[eqIdx].split(/[;,\/]/);
      for (const tok of tokens) {
        const trimmedTok = tok.trim();
        const eq = trimmedTok ? parseEquipmentToken(trimmedTok) : null;
        if (!eq) {
          errors.push(`Row ${r + 1} (${title}): Invalid requiredEquipment token '${trimmedTok}'`);
          hasInvalidReqEquip = true;
          break;
        }
        if (!requiredEquipment.includes(eq)) requiredEquipment.push(eq);
      }
    }
    if (hasInvalidReqEquip) continue;

    let requiredRoomType: RoomType | undefined = undefined;
    if (roomTypeIdx !== -1 && (row[roomTypeIdx] ?? "").trim() !== "") {
      const parsedRt = parseRoomTypeToken(row[roomTypeIdx]);
      if (!parsedRt) {
        errors.push(`Row ${r + 1} (${title}): Invalid requiredRoomType '${row[roomTypeIdx]}'`);
        continue;
      }
      requiredRoomType = parsedRt;
    }

    courses.push({
      id,
      title,
      shortTitle: title.length > 8 ? title.slice(0, 8) : title,
      professorId,
      cohorts,
      category,
      enrollment,
      sessionsPerWeek,
      requiredEquipment,
      requiredRoomType,
      aliases: [id, title],
    });
  }

  return { courses, errors };
}

// -------------------------------------------------------------
// EXPORTERS & SAMPLES
// -------------------------------------------------------------
function escapeCsv(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes(";")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportProfessorsCsv(professors: ProfessorProfile[]): string {
  const headers = [
    "id",
    "name",
    "title",
    "employment",
    "unavailableDays",
    "unavailableSlots",
    "avoidPeriod1",
    "avoidPeriod5",
    "maxSessionsPerDay",
  ];
  const rows = professors.map((p) => [
    escapeCsv(p.id),
    escapeCsv(p.name),
    escapeCsv(p.title),
    escapeCsv(p.employment),
    escapeCsv(p.unavailableDays.join(";")),
    escapeCsv(
      p.unavailableSlots
        .map((s) => `${s.day}-${s.period}${s.reason ? `(${s.reason})` : ""}`)
        .join(";")
    ),
    escapeCsv(p.avoidPeriod1),
    escapeCsv(p.avoidPeriod5),
    escapeCsv(p.maxSessionsPerDay),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function exportRoomsCsv(rooms: RoomProfile[]): string {
  const headers = ["id", "name", "capacity", "roomType", "equipment", "building"];
  const rows = rooms.map((r) => [
    escapeCsv(r.id),
    escapeCsv(r.name),
    escapeCsv(r.capacity),
    escapeCsv(r.roomType),
    escapeCsv(r.equipment.join(";")),
    escapeCsv(r.building),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function exportCoursesCsv(courses: CourseProfile[]): string {
  const headers = [
    "id",
    "title",
    "professorId",
    "cohorts",
    "category",
    "enrollment",
    "sessionsPerWeek",
    "requiredEquipment",
    "requiredRoomType",
  ];
  const rows = courses.map((c) => [
    escapeCsv(c.id),
    escapeCsv(c.title),
    escapeCsv(c.professorId),
    escapeCsv(c.cohorts.join(";")),
    escapeCsv(c.category),
    escapeCsv(c.enrollment),
    escapeCsv(c.sessionsPerWeek),
    escapeCsv(c.requiredEquipment.join(";")),
    escapeCsv(c.requiredRoomType ?? ""),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function getSampleProfessorsCsv(): string {
  return exportProfessorsCsv(createDefaultProfessors());
}

export function getSampleRoomsCsv(): string {
  return exportRoomsCsv(createDefaultRooms());
}

export function getSampleCoursesCsv(): string {
  return exportCoursesCsv(createDefaultCourses());
}

export function validateTimetableDataset(
  professors: ProfessorProfile[],
  rooms: RoomProfile[],
  courses: CourseProfile[]
): string[] {
  const errors: string[] = [];

  if (professors.length === 0) {
    errors.push("Faculty data is empty (at least 1 required)");
  }
  if (rooms.length === 0) {
    errors.push("Room data is empty (at least 1 required)");
  }
  if (courses.length === 0) {
    errors.push("Course data is empty (at least 1 required)");
  }

  // Check unique IDs for professors
  const profIdSet = new Set<string>();
  for (const p of professors) {
    if (profIdSet.has(p.id)) {
      errors.push(`Duplicate faculty ID '${p.id}' (${p.name})`);
    } else {
      profIdSet.add(p.id);
    }
  }

  // Check unique IDs for rooms
  const roomIdSet = new Set<string>();
  for (const r of rooms) {
    if (roomIdSet.has(r.id)) {
      errors.push(`Duplicate room ID '${r.id}' (${r.name})`);
    } else {
      roomIdSet.add(r.id);
    }
  }

  // Check unique IDs for courses and reference integrity
  const courseIdSet = new Set<string>();
  for (const c of courses) {
    if (courseIdSet.has(c.id)) {
      errors.push(`Duplicate course ID '${c.id}' (${c.title})`);
    } else {
      courseIdSet.add(c.id);
    }

    if (!profIdSet.has(c.professorId)) {
      errors.push(`Course "${c.title}" (${c.id}): Professor ID '${c.professorId}' does not exist in faculty list`);
    }
  }

  return errors;
}
