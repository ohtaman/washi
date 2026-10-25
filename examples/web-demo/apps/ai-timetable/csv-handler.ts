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
  return h.toLowerCase().replace(/[\s_\-（）()・]/g, "");
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
  if (t === "large_hall" || t.includes("大講義") || t.includes("大ホール")) return "large_hall";
  if (t === "pc_lab" || t.includes("pc") || t.includes("演習室") || t.includes("端末")) return "pc_lab";
  if (t === "seminar_room" || t.includes("ゼミ") || t.includes("小教室")) return "seminar_room";
  return "medium_room";
}

function parseCategoryToken(token: string): CourseCategory {
  const t = token.trim().toLowerCase();
  if (t === "compulsory" || t === "必修" || t.includes("必修講義")) return "compulsory";
  if (t === "elective_core" || t === "選必" || t.includes("選択必修")) return "elective_core";
  if (t === "lab_exercise" || t === "演習" || t.includes("pc演習") || t.includes("実験")) return "lab_exercise";
  if (t === "seminar" || t === "ゼミ" || t.includes("輪講")) return "seminar";
  return "elective";
}

function parseEquipmentToken(token: string): RoomEquipment | null {
  const t = token.trim().toLowerCase();
  if (t === "projector" || t.includes("プロジェクタ")) return "projector";
  if (t === "mic" || t.includes("マイク") || t.includes("音響")) return "mic";
  if (t === "pc_terminal" || t.includes("pc") || t.includes("端末")) return "pc_terminal";
  if (t === "moveable_desks" || t.includes("可動") || t.includes("机")) return "moveable_desks";
  if (t === "recording" || t.includes("収録") || t.includes("録画")) return "recording";
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
    return { professors: [], errors: ["教員CSVにデータ行がありません (ヘッダー行＋1行以上必要です)"] };
  }

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);
  const idIdx = headers.findIndex((h) => h === "id" || h === "教員id" || h === "コード");
  const nameIdx = headers.findIndex((h) => h === "name" || h === "氏名" || h === "教員名" || h === "名前");
  const titleIdx = headers.findIndex((h) => h === "title" || h === "役職" || h === "職階");
  const empIdx = headers.findIndex((h) => h === "employment" || h === "雇用形態" || h === "身分" || h === "区分");
  const unavailIdx = headers.findIndex((h) => h === "unavailabledays" || h === "不可曜日" || h === "出講不可曜日" || h === "ng曜日");
  const p1Idx = headers.findIndex((h) => h === "avoidperiod1" || h === "1限回避" || h === "1限ng");
  const p5Idx = headers.findIndex((h) => h === "avoidperiod5" || h === "5限回避" || h === "5限ng");
  const maxIdx = headers.findIndex((h) => h === "maxsessionsperday" || h === "1日最大コマ数" || h === "最大コマ");

  if (idIdx === -1 || nameIdx === -1) {
    return {
      professors: [],
      errors: ["教員CSVには 'id' (教員ID) と 'name' (氏名) 列が必須です。"],
    };
  }

  const professors: ProfessorProfile[] = [];
  const errors: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = row[idIdx]?.trim();
    const name = row[nameIdx]?.trim();
    if (!id || !name) {
      errors.push(`行 ${r + 1}: IDまたは氏名が空です`);
      continue;
    }

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
      unavailableSlots: [],
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
    return { rooms: [], errors: ["教室CSVにデータ行がありません (ヘッダー行＋1行以上必要です)"] };
  }

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);
  const idIdx = headers.findIndex((h) => h === "id" || h === "教室id" || h === "部屋id" || h === "コード");
  const nameIdx = headers.findIndex((h) => h === "name" || h === "教室名" || h === "部屋名");
  const capIdx = headers.findIndex((h) => h === "capacity" || h === "収容定員" || h === "定員" || h === "人数");
  const typeIdx = headers.findIndex((h) => h === "roomtype" || h === "教室種別" || h === "種別" || h === "タイプ");
  const eqIdx = headers.findIndex((h) => h === "equipment" || h === "設備" || h === "備品");

  if (idIdx === -1 || nameIdx === -1 || capIdx === -1) {
    return {
      rooms: [],
      errors: ["教室CSVには 'id' (教室ID), 'name' (教室名), 'capacity' (定員) 列が必須です。"],
    };
  }

  const rooms: RoomProfile[] = [];
  const errors: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = row[idIdx]?.trim();
    const name = row[nameIdx]?.trim();
    const capNum = row[capIdx] ? Number(row[capIdx]) : NaN;

    if (!id || !name || isNaN(capNum) || capNum <= 0) {
      errors.push(`行 ${r + 1}: ID, 教室名, または有効な定員(正の数値)がありません`);
      continue;
    }

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
    return { courses: [], errors: ["科目CSVにデータ行がありません (ヘッダー行＋1行以上必要です)"] };
  }

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);
  const idIdx = headers.findIndex((h) => h === "id" || h === "科目id" || h === "コード");
  const titleIdx = headers.findIndex((h) => h === "title" || h === "科目名" || h === "授業名" || h === "名称");
  const profIdx = headers.findIndex((h) => h === "professorid" || h === "担当教員id" || h === "教員id" || h === "教員");
  const cohortIdx = headers.findIndex((h) => h === "cohorts" || h === "学年" || h === "対象学年" || h === "年次");
  const catIdx = headers.findIndex((h) => h === "category" || h === "区分" || h === "科目区分" || h === "種別");
  const enrollIdx = headers.findIndex((h) => h === "enrollment" || h === "受講者数" || h === "受講予定人数" || h === "人数");
  const sesIdx = headers.findIndex((h) => h === "sessionsperweek" || h === "週コマ数" || h === "コマ数" || h === "コマ");
  const eqIdx = headers.findIndex((h) => h === "requiredequipment" || h === "必要設備" || h === "必須設備");
  const roomTypeIdx = headers.findIndex((h) => h === "requiredroomtype" || h === "必要教室種別" || h === "指定教室種別");

  if (idIdx === -1 || titleIdx === -1 || profIdx === -1) {
    return {
      courses: [],
      errors: ["科目CSVには 'id' (科目ID), 'title' (科目名), 'professorId' (担当教員ID) 列が必須です。"],
    };
  }

  const courses: CourseProfile[] = [];
  const errors: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = row[idIdx]?.trim();
    const title = row[titleIdx]?.trim();
    const professorId = row[profIdx]?.trim();

    if (!id || !title || !professorId) {
      errors.push(`行 ${r + 1}: ID, 科目名, または担当教員IDが空です`);
      continue;
    }

    if (knownProfIds && knownProfIds.size > 0 && !knownProfIds.has(professorId)) {
      errors.push(`行 ${r + 1} (${title}): 教員ID '${professorId}' は教員リストに存在しません`);
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
