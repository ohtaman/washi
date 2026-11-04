import enCatalog from "./locales/en.json" with { type: "json" };
import jaCatalog from "./locales/ja.json" with { type: "json" };
import zhCatalog from "./locales/zh.json" with { type: "json" };

const ALL_CSV_CATALOGS = [enCatalog.csv, jaCatalog.csv, zhCatalog.csv];

function matchesHeader(h: string, field: string, section: "professors" | "rooms" | "courses"): boolean {
  for (const cat of ALL_CSV_CATALOGS) {
    const list = (cat as any)[section]?.[field];
    if (list && list.includes(h)) return true;
  }
  return false;
}

function matchesToken(t: string, tokenKey: string): boolean {
  for (const cat of ALL_CSV_CATALOGS) {
    const list = (cat as any).tokens?.[tokenKey];
    if (list && list.some((k: string) => t === k || t.includes(k))) return true;
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

function parseRoomTypeToken(token: string): RoomType {
  const t = token.trim().toLowerCase();
  if (matchesToken(t, "large_hall")) return "large_hall";
  if (matchesToken(t, "pc_lab")) return "pc_lab";
  if (matchesToken(t, "seminar_room")) return "seminar_room";
  return "medium_room";
}

function parseCategoryToken(token: string): CourseCategory {
  const t = token.trim().toLowerCase();
  if (matchesToken(t, "compulsory")) return "compulsory";
  if (matchesToken(t, "elective_core")) return "elective_core";
  if (matchesToken(t, "lab_exercise")) return "lab_exercise";
  if (matchesToken(t, "seminar")) return "seminar";
  return "elective";
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

    const title = titleIdx !== -1 && row[titleIdx] ? row[titleIdx].trim() : "講師";
    const empRaw = empIdx !== -1 && row[empIdx] ? row[empIdx].trim().toLowerCase() : "";
    const employment: ProfessorEmploymentType =
      empRaw === "adjunct" || empRaw.includes("非常勤") ? "adjunct" : "full_time";

    const unavailableDays: TimetableDay[] = [];
    if (unavailIdx !== -1 && row[unavailIdx]) {
      const tokens = row[unavailIdx].split(/[;,\/]/);
      for (const tok of tokens) {
        const d = parseDayToken(tok);
        if (d && !unavailableDays.includes(d)) {
          unavailableDays.push(d);
        }
      }
    }

    const unavailableSlots: Array<{ day: TimetableDay; period: TimetablePeriod; reason?: string }> = [];
    if (slotIdx !== -1 && row[slotIdx]) {
      const tokens = row[slotIdx].split(";");
      for (const tok of tokens) {
        const slot = parseSlotToken(tok);
        if (slot) {
          unavailableSlots.push(slot);
        }
      }
    }

    const avoidP1 =
      p1Idx !== -1 && row[p1Idx]
        ? ["true", "1", "yes", "要", "回避"].includes(row[p1Idx].trim().toLowerCase())
        : false;
    const avoidP5 =
      p5Idx !== -1 && row[p5Idx]
        ? ["true", "1", "yes", "要", "回避"].includes(row[p5Idx].trim().toLowerCase())
        : false;
    const maxSessions =
      maxIdx !== -1 && row[maxIdx] && !isNaN(Number(row[maxIdx]))
        ? Math.max(1, Math.min(5, Number(row[maxIdx])))
        : employment === "adjunct" ? 3 : 2;

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
    const capNum = row[capIdx] ? Number(row[capIdx]) : NaN;

    if (!id || !name || isNaN(capNum) || capNum <= 0) {
      errors.push(`Row ${r + 1}: ID, room name, or valid positive capacity is missing`);
      continue;
    }
    if (seenIds.has(id)) {
      errors.push(`Row ${r + 1}: Duplicate room ID '${id}'`);
      continue;
    }
    seenIds.add(id);

    const roomType = typeIdx !== -1 && row[typeIdx] ? parseRoomTypeToken(row[typeIdx]) : "medium_room";
    const equipment: RoomEquipment[] = [];
    if (eqIdx !== -1 && row[eqIdx]) {
      const tokens = row[eqIdx].split(/[;,\/]/);
      for (const tok of tokens) {
        const eq = parseEquipmentToken(tok);
        if (eq && !equipment.includes(eq)) {
          equipment.push(eq);
        }
      }
    }

    rooms.push({
      id,
      name,
      shortName: name.length > 8 ? name.slice(0, 8) : name,
      building: "本館",
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
    }

    const cohorts: CohortId[] = [];
    if (cohortIdx !== -1 && row[cohortIdx]) {
      const tokens = row[cohortIdx].split(/[;,\/]/);
      for (const tok of tokens) {
        const c = parseCohortToken(tok);
        if (c && !cohorts.includes(c)) cohorts.push(c);
      }
    }
    if (cohorts.length === 0) cohorts.push("Y1");

    const category = catIdx !== -1 && row[catIdx] ? parseCategoryToken(row[catIdx]) : "elective";
    const enrollment =
      enrollIdx !== -1 && row[enrollIdx] && !isNaN(Number(row[enrollIdx]))
        ? Math.max(1, Number(row[enrollIdx]))
        : 60;
    const sessionsPerWeek =
      sesIdx !== -1 && row[sesIdx] && (Number(row[sesIdx]) === 2 || Number(row[sesIdx]) === 1)
        ? (Number(row[sesIdx]) as 1 | 2)
        : 1;

    const requiredEquipment: RoomEquipment[] = [];
    if (eqIdx !== -1 && row[eqIdx]) {
      const tokens = row[eqIdx].split(/[;,\/]/);
      for (const tok of tokens) {
        const eq = parseEquipmentToken(tok);
        if (eq && !requiredEquipment.includes(eq)) requiredEquipment.push(eq);
      }
    }

    let requiredRoomType: RoomType | undefined = undefined;
    if (roomTypeIdx !== -1 && row[roomTypeIdx] && row[roomTypeIdx].trim()) {
      requiredRoomType = parseRoomTypeToken(row[roomTypeIdx]);
    } else if (category === "lab_exercise" || requiredEquipment.includes("pc_terminal")) {
      requiredRoomType = "pc_lab";
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
  const headers = ["id", "name", "capacity", "roomType", "equipment"];
  const rows = rooms.map((r) => [
    escapeCsv(r.id),
    escapeCsv(r.name),
    escapeCsv(r.capacity),
    escapeCsv(r.roomType),
    escapeCsv(r.equipment.join(";")),
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
