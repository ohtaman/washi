import {
  type ContractPresetId,
  type NurseProfile,
  type NurseSkill,
  type PairRelation,
  type ShiftCode,
  type ShiftPreference,
} from "./types.js";
import { generateNurseSchedulingState } from "./generator.js";

// RFC 4180 compliant CSV line tokenizer
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  const cleanText = text.replace(/^\uFEFF/, "");
  const lines = cleanText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
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

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function normalizeHeader(h: string): string {
  return h.replace(/^\uFEFF/, "").toLowerCase().replace(/[\s_\-（）()\u30FB/]/g, "");
}

export function parseBooleanToken(token: string | undefined, defaultVal = false): boolean {
  if (!token) return defaultVal;
  const t = token.trim().toLowerCase();
  if (["1", "true", "yes", "y", "t", "可", "○", "\u306F\u3044", "on", "確定"].includes(t)) return true;
  if (["0", "false", "no", "n", "f", "不可", "×", "\u3044\u3044\u3048", "off", "希望"].includes(t)) return false;
  return defaultVal;
}

export const BUILTIN_SHIFT_CODES: ReadonlySet<string> = new Set([
  "D",
  "E",
  "N",
  "O",
  "W",
  "EN",
]);

export function parseShiftToken(
  token: string | undefined,
  customShiftCodes?: ReadonlySet<string>
): ShiftCode | null {
  if (!token) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (BUILTIN_SHIFT_CODES.has(upper)) return upper as ShiftCode;
  if (upper === "日" || upper === "日勤") return "D";
  if (upper === "準" || upper === "準夜" || upper === "準夜勤") return "E";
  if (upper === "深" || upper === "深夜" || upper === "深夜勤") return "N";
  if (upper === "休" || upper === "公休" || upper === "休\u307F") return "O";
  if (upper === "勤" || upper === "勤務") return "W";
  if (upper === "夜" || upper === "夜勤") return "EN";
  if (customShiftCodes && customShiftCodes.has(trimmed)) {
    return trimmed;
  }
  return null;
}

export function parseSkillToken(token: string): NurseSkill | null {
  const t = token.trim();
  if (!t) return null;
  // Exact match for known identifiers first (preserves "leader", "team_A", "team_B", "mid", "newcomer", "leader_cap", "icu_er", "ventilator")
  if (/^[a-zA-Z0-9_\-]+$/.test(t)) {
    return t as NurseSkill;
  }
  // Japanese alias mappings
  if (t.includes("\u30EA\u30FC\u30C0\u30FC") || t === "\u30EA") return "leader_cap";
  if (t.includes("救急") || t.includes("重症") || t.includes("ICU") || t === "救") return "icu_er";
  if (t.includes("呼吸器") || t === "呼") return "ventilator";
  if (t.includes("\u30C1\u30FC\u30E0A") || t.includes("A\u30C1\u30FC\u30E0") || t.includes("A班")) return "team_A";
  if (t.includes("\u30C1\u30FC\u30E0B") || t.includes("B\u30C1\u30FC\u30E0") || t.includes("B班")) return "team_B";
  if (t.includes("新人")) return "newcomer";
  if (t.includes("中堅")) return "mid";
  if (t.includes("主任")) return "leader";
  return t as NurseSkill;
}

// -------------------------------------------------------------
// 1. Nurses CSV Export & Parse
// -------------------------------------------------------------

export function exportNursesCsv(nurses: NurseProfile[]): string {
  const headers = [
    "id",
    "name",
    "kana",
    "skills",
    "yearsExp",
    "contractPreset",
    "nightOk",
    "maxMonthlyNightShifts",
    "minMonthlyDaysOff",
    "minMonthlyWorkDays",
    "maxMonthlyWorkDays",
    "maxConsecutiveWorkDays",
    "weekdayOnly",
    "holidaysOff",
    "prevMonthShifts",
  ];

  const rows = nurses.map((n) => [
    escapeCsv(n.id),
    escapeCsv(n.name),
    escapeCsv(n.kana),
    escapeCsv(n.skills.join(";")),
    escapeCsv(n.yearsExp),
    escapeCsv(n.contractPreset ?? ""),
    escapeCsv(n.nightOk ? "1" : "0"),
    escapeCsv(n.maxMonthlyNightShifts ?? ""),
    escapeCsv(n.minMonthlyDaysOff ?? ""),
    escapeCsv(n.minMonthlyWorkDays ?? ""),
    escapeCsv(n.maxMonthlyWorkDays ?? ""),
    escapeCsv(n.maxConsecutiveWorkDays ?? ""),
    escapeCsv(n.weekdayOnly ? "1" : "0"),
    escapeCsv(n.holidaysOff ? "1" : "0"),
    escapeCsv(n.prevMonthShifts.join(";")),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function parseNursesCsv(text: string): {
  nurses: NurseProfile[];
  errors: string[];
  warnings: string[];
} {
  const rows = parseCsvRows(text);
  const errors: string[] = [];
  const warnings: string[] = [];
  const nurses: NurseProfile[] = [];

  if (rows.length === 0) {
    errors.push("CSV\u30D5\u30A1\u30A4\u30EB\u304C空\u3067\u3059。");
    return { nurses, errors, warnings };
  }

  const rawHeaders = rows[0];
  const headerMap = new Map<string, number>();
  rawHeaders.forEach((h, idx) => {
    headerMap.set(normalizeHeader(h), idx);
  });

  const getCol = (row: string[], ...keys: string[]): string | undefined => {
    for (const k of keys) {
      const idx = headerMap.get(normalizeHeader(k));
      if (idx !== undefined && idx < row.length) {
        return row[idx].trim();
      }
    }
    return undefined;
  };

  const seenIds = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = getCol(row, "id", "看護師ID", "ID", "\u30B9\u30BF\u30C3\u30D5ID");
    const name = getCol(row, "name", "氏名", "名前");

    if (!id || !name) {
      warnings.push(`行 ${r + 1}: ID\u307E\u305F\u306F氏名\u304C空\u306E\u305F\u3081\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3057\u305F。`);
      continue;
    }

    if (seenIds.has(id)) {
      errors.push(`行 ${r + 1}: 看護師ID "${id}" \u304C重複\u3057\u3066\u3044\u307E\u3059。`);
      continue;
    }
    seenIds.add(id);

    const kana = getCol(row, "kana", "\u30D5\u30EA\u30AC\u30CA", "\u3075\u308A\u304C\u306A", "\u304B\u306A") ?? name;
    const skillsRaw =
      getCol(
        row,
        "skills",
        "\u30B9\u30AD\u30EB",
        "保有\u30B9\u30AD\u30EB",
        "所属属性\u30BF\u30B0",
        "属性\u30BF\u30B0",
        "所属属性",
        "属性",
        "\u30BF\u30B0"
      ) ?? "";
    const skills: NurseSkill[] = skillsRaw
      ? (skillsRaw
          .split(/[;,]/)
          .map((s) => parseSkillToken(s))
          .filter(Boolean) as NurseSkill[])
      : [];

    const yearsExp = parseInt(getCol(row, "yearsexp", "経験年数", "年数") ?? "5", 10) || 5;
    const contractPreset = getCol(row, "contractpreset", "契約形態", "勤務区分") as ContractPresetId | undefined;
    const nightOk = parseBooleanToken(getCol(row, "nightok", "夜勤可否", "夜勤可"), true);

    const maxMonthlyNightShiftsRaw = getCol(row, "maxmonthlynightshifts", "月間夜勤上限", "夜勤上限");
    const maxMonthlyNightShifts = maxMonthlyNightShiftsRaw ? parseInt(maxMonthlyNightShiftsRaw, 10) : undefined;

    const minMonthlyDaysOffRaw = getCol(row, "minmonthlydaysoff", "最小公休数", "公休数");
    const minMonthlyDaysOff = minMonthlyDaysOffRaw ? parseInt(minMonthlyDaysOffRaw, 10) : undefined;

    const minMonthlyWorkDaysRaw = getCol(row, "minmonthlyworkdays", "最小勤務日数");
    const minMonthlyWorkDays = minMonthlyWorkDaysRaw ? parseInt(minMonthlyWorkDaysRaw, 10) : undefined;

    const maxMonthlyWorkDaysRaw = getCol(row, "maxmonthlyworkdays", "最大勤務日数");
    const maxMonthlyWorkDays = maxMonthlyWorkDaysRaw ? parseInt(maxMonthlyWorkDaysRaw, 10) : undefined;

    const maxConsecutiveWorkDaysRaw = getCol(row, "maxconsecutiveworkdays", "最大連勤日数", "連勤上限");
    const maxConsecutiveWorkDays = maxConsecutiveWorkDaysRaw ? parseInt(maxConsecutiveWorkDaysRaw, 10) : undefined;

    const weekdayOnly = parseBooleanToken(getCol(row, "weekdayonly", "平日専従", "平日\u306E\u307F"), false);
    const holidaysOff = parseBooleanToken(getCol(row, "holidaysoff", "祝日休", "祝日休\u307F"), false);

    const prevMonthShiftsRaw = getCol(row, "prevmonthshifts", "前月最終勤務", "前月末\u30B7\u30D5\u30C8") ?? "";
    let prevMonthShifts: ShiftCode[] = [];
    if (prevMonthShiftsRaw) {
      const tokens = prevMonthShiftsRaw
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const tok of tokens) {
        const parsed = parseShiftToken(tok);
        if (parsed) {
          prevMonthShifts.push(parsed);
        } else {
          warnings.push(`行 ${r + 1}: 前月\u30B7\u30D5\u30C8 "${tok}" \u306F未定義\u306E\u305F\u3081公休(O)\u3068\u3057\u3066扱\u3044\u307E\u3057\u305F。`);
          prevMonthShifts.push("O");
        }
      }
    }
    while (prevMonthShifts.length < 7) {
      prevMonthShifts.unshift("O");
    }
    if (prevMonthShifts.length > 7) {
      prevMonthShifts = prevMonthShifts.slice(-7);
    }

    nurses.push({
      id,
      name,
      kana,
      skills,
      contractPreset: contractPreset || undefined,
      nightOk,
      maxMonthlyNightShifts,
      minMonthlyDaysOff,
      minMonthlyWorkDays,
      maxMonthlyWorkDays,
      maxConsecutiveWorkDays,
      weekdayOnly,
      holidaysOff,
      yearsExp,
      prevMonthShifts,
      yearly36Stats: {
        past11MonthsOvertimeHours: Math.min(300, yearsExp * 15 + 60),
        currentMonthOvertimeHours: 0,
        annualProjectedHours: Math.min(300, yearsExp * 15 + 60),
        specialExtensionMonthsCount: 0,
      },
    });
  }

  return { nurses, errors, warnings };
}

// -------------------------------------------------------------
// 2. Shift Preferences / Requests CSV Export & Parse
// -------------------------------------------------------------

export function exportRequestsCsv(preferences: ShiftPreference[]): string {
  const headers = ["nurseId", "day", "shift", "isHard", "reason"];
  const rows = preferences.map((p) => [
    escapeCsv(p.nurseId),
    escapeCsv(p.day),
    escapeCsv(p.shift),
    escapeCsv(p.isHard ? "1" : "0"),
    escapeCsv(p.reason),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function parseRequestsCsv(
  text: string,
  knownNurseIds?: Set<string>,
  customShiftCodes?: ReadonlySet<string>
): {
  preferences: ShiftPreference[];
  errors: string[];
  warnings: string[];
} {
  const rows = parseCsvRows(text);
  const errors: string[] = [];
  const warnings: string[] = [];
  const preferences: ShiftPreference[] = [];

  if (rows.length === 0) {
    return { preferences, errors, warnings };
  }

  const rawHeaders = rows[0];
  const headerMap = new Map<string, number>();
  rawHeaders.forEach((h, idx) => {
    headerMap.set(normalizeHeader(h), idx);
  });

  const getCol = (row: string[], ...keys: string[]): string | undefined => {
    for (const k of keys) {
      const idx = headerMap.get(normalizeHeader(k));
      if (idx !== undefined && idx < row.length) {
        return row[idx].trim();
      }
    }
    return undefined;
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const nurseId = getCol(row, "nurseid", "看護師id", "\u30B9\u30BF\u30C3\u30D5id", "id");
    const dayRaw = getCol(row, "day", "日付", "日");
    const shiftRaw = getCol(row, "shift", "\u30B7\u30D5\u30C8", "希望\u30B7\u30D5\u30C8");

    if (!nurseId || !dayRaw) {
      warnings.push(`行 ${r + 1}: nurseId\u307E\u305F\u306Fday\u304C空\u306E\u305F\u3081\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3057\u305F。`);
      continue;
    }

    if (knownNurseIds && !knownNurseIds.has(nurseId)) {
      errors.push(`行 ${r + 1}: \u30B9\u30BF\u30C3\u30D5名簿\u306B存在\u3057\u306A\u3044看護師ID "${nurseId}" \u3067\u3059。`);
      continue;
    }

    const day = parseInt(dayRaw, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      errors.push(`行 ${r + 1}: 不正\u306A日付 "${dayRaw}" \u3067\u3059 (1〜31\u306E範囲\u3092指定\u3057\u3066\u304F\u3060\u3055\u3044)。`);
      continue;
    }

    const shift = parseShiftToken(shiftRaw, customShiftCodes);
    if (!shift) {
      errors.push(
        `行 ${r + 1}: 不明\u306A\u30B7\u30D5\u30C8\u30B3\u30FC\u30C9 "${shiftRaw}" \u3067\u3059 (D/日勤, E/準夜, N/深夜, O/公休, W/勤務, EN/夜勤 \u3092指定\u3057\u3066\u304F\u3060\u3055\u3044)。`
      );
      continue;
    }

    const isHard = parseBooleanToken(getCol(row, "ishard", "確定\u30D5\u30E9\u30B0", "確定", "必須"), false);
    const reason = getCol(row, "reason", "理由", "備考") ?? (isHard ? "確定希望" : "希望\u30B7\u30D5\u30C8");

    preferences.push({
      id: `pref_${nurseId}_${day}_${preferences.length}`,
      nurseId,
      day,
      shift,
      isHard,
      reason,
    });
  }

  return { preferences, errors, warnings };
}

// -------------------------------------------------------------
// 3. Relations CSV Export & Parse
// -------------------------------------------------------------

export function exportRelationsCsv(relations: PairRelation[]): string {
  const headers = ["type", "nurseA", "nurseB", "shifts", "isHard", "reason"];
  const rows = relations.map((rel) => [
    escapeCsv(rel.type),
    escapeCsv(rel.nurseA),
    escapeCsv(rel.nurseB),
    escapeCsv((rel.shifts ?? ["E", "N"]).join(";")),
    escapeCsv(rel.isHard ?? true ? "1" : "0"),
    escapeCsv(rel.reason),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function parseRelationsCsv(
  text: string,
  knownNurseIds?: Set<string>,
  customShiftCodes?: ReadonlySet<string>
): {
  relations: PairRelation[];
  errors: string[];
  warnings: string[];
} {
  const rows = parseCsvRows(text);
  const errors: string[] = [];
  const warnings: string[] = [];
  const relations: PairRelation[] = [];

  if (rows.length === 0) {
    return { relations, errors, warnings };
  }

  const rawHeaders = rows[0];
  const headerMap = new Map<string, number>();
  rawHeaders.forEach((h, idx) => {
    headerMap.set(normalizeHeader(h), idx);
  });

  const getCol = (row: string[], ...keys: string[]): string | undefined => {
    for (const k of keys) {
      const idx = headerMap.get(normalizeHeader(k));
      if (idx !== undefined && idx < row.length) {
        return row[idx].trim();
      }
    }
    return undefined;
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const typeRaw = getCol(row, "type", "種別", "\u30BF\u30A4\u30D7") ?? "ng_pair";
    const nurseA = getCol(row, "nursea", "\u30B9\u30BF\u30C3\u30D5a", "看護師a", "\u30DA\u30A21");
    const nurseB = getCol(row, "nurseb", "\u30B9\u30BF\u30C3\u30D5b", "看護師b", "\u30DA\u30A22");

    if (!nurseA || !nurseB) {
      warnings.push(`行 ${r + 1}: nurseA\u307E\u305F\u306FnurseB\u304C空\u306E\u305F\u3081\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3057\u305F。`);
      continue;
    }

    if (nurseA === nurseB) {
      errors.push(`行 ${r + 1}: 同一人物 "${nurseA}" 同士\u306E自己\u30DA\u30A2\u306F指定\u3067\u304D\u307E\u305B\u3093。`);
      continue;
    }

    if (knownNurseIds) {
      if (!knownNurseIds.has(nurseA)) {
        errors.push(`行 ${r + 1}: \u30B9\u30BF\u30C3\u30D5名簿\u306B存在\u3057\u306A\u3044看護師A "${nurseA}" \u3067\u3059。`);
        continue;
      }
      if (!knownNurseIds.has(nurseB)) {
        errors.push(`行 ${r + 1}: \u30B9\u30BF\u30C3\u30D5名簿\u306B存在\u3057\u306A\u3044看護師B "${nurseB}" \u3067\u3059。`);
        continue;
      }
    }

    const type = typeRaw.includes("preceptor") || typeRaw.includes("指導") ? "preceptor" : "ng_pair";
    const shiftsRaw = getCol(row, "shifts", "対象\u30B7\u30D5\u30C8", "\u30B7\u30D5\u30C8");
    const rawTokens = shiftsRaw
      ? shiftsRaw
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    // Default to standard night shifts (E;N) if the cell is omitted or empty
    const shiftTokens = rawTokens.length > 0 ? rawTokens : ["E", "N"];
    const shifts: ShiftCode[] = [];
    let hasUnknownShift = false;
    for (const st of shiftTokens) {
      const parsed = parseShiftToken(st, customShiftCodes);
      if (!parsed) {
        errors.push(`行 ${r + 1}: \u30DA\u30A2制約\u306B対象外\u307E\u305F\u306F不明\u306A\u30B7\u30D5\u30C8\u30B3\u30FC\u30C9 "${st}" \u304C含\u307E\u308C\u3066\u3044\u307E\u3059。`);
        hasUnknownShift = true;
        break;
      }
      shifts.push(parsed);
    }
    if (hasUnknownShift) continue;

    const isHard = parseBooleanToken(getCol(row, "ishard", "確定\u30D5\u30E9\u30B0", "必須"), true);
    const reason = getCol(row, "reason", "理由", "備考") ?? (type === "preceptor" ? "\u30D7\u30EA\u30BB\u30D7\u30BF\u30FC指導\u30DA\u30A2" : "相性NG\u30DA\u30A2");

    relations.push({
      id: `rel_${type}_${nurseA}_${nurseB}_${relations.length}`,
      type,
      nurseA,
      nurseB,
      shifts,
      isHard,
      reason,
    });
  }

  return { relations, errors, warnings };
}

// -------------------------------------------------------------
// 4. Validation of Full Dataset
// -------------------------------------------------------------

export function validateNurseDataset(
  nurses: NurseProfile[],
  preferences: ShiftPreference[],
  relations: PairRelation[],
  numDays = 30,
  customShiftCodes?: ReadonlySet<string>
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (nurses.length === 0) {
    errors.push("\u30B9\u30BF\u30C3\u30D5\u304C1名\u3082登録\u3055\u308C\u3066\u3044\u307E\u305B\u3093。");
    return { valid: false, errors, warnings };
  }

  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  if (nurseMap.size < nurses.length) {
    errors.push("\u30B9\u30BF\u30C3\u30D5ID\u306B重複\u304C\u3042\u308A\u307E\u3059。");
  }

  for (const pref of preferences) {
    if (!nurseMap.has(pref.nurseId)) {
      errors.push(`希望\u30B7\u30D5\u30C8\u306E看護師ID "${pref.nurseId}" \u306F\u30B9\u30BF\u30C3\u30D5名簿\u306B存在\u3057\u307E\u305B\u3093。`);
    }
    if (pref.day < 1 || pref.day > numDays) {
      errors.push(`希望\u30B7\u30D5\u30C8\u306E日付 "${pref.day}" \u306F月\u306E日数(1〜${numDays})\u306E範囲外\u3067\u3059。`);
    }
    if (!parseShiftToken(pref.shift, customShiftCodes)) {
      errors.push(`希望\u30B7\u30D5\u30C8\u306E\u30B7\u30D5\u30C8\u30B3\u30FC\u30C9 "${pref.shift}" \u306F無効\u307E\u305F\u306F未定義\u3067\u3059。`);
    }
  }

  for (const rel of relations) {
    if (!nurseMap.has(rel.nurseA)) {
      errors.push(`\u30DA\u30A2制約\u306E看護師A "${rel.nurseA}" \u306F\u30B9\u30BF\u30C3\u30D5名簿\u306B存在\u3057\u307E\u305B\u3093。`);
    }
    if (!nurseMap.has(rel.nurseB)) {
      errors.push(`\u30DA\u30A2制約\u306E看護師B "${rel.nurseB}" \u306F\u30B9\u30BF\u30C3\u30D5名簿\u306B存在\u3057\u307E\u305B\u3093。`);
    }
    if (rel.nurseA === rel.nurseB) {
      errors.push(`自己\u30DA\u30A2制約 "${rel.nurseA}" \u306F無効\u3067\u3059。`);
    }
    if (!rel.shifts || rel.shifts.length === 0) {
      errors.push(`\u30DA\u30A2制約 "${rel.nurseA} × ${rel.nurseB}" \u306E対象\u30B7\u30D5\u30C8\u304C空\u3067\u3059。`);
    } else {
      for (const s of rel.shifts) {
        if (!parseShiftToken(s, customShiftCodes)) {
          errors.push(`\u30DA\u30A2制約\u306E対象\u30B7\u30D5\u30C8 "${s}" \u306F無効\u307E\u305F\u306F未定義\u3067\u3059。`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// -------------------------------------------------------------
// 5. Sample Dataset CSV Providers
// -------------------------------------------------------------

export function getSampleNursesCsv(): string {
  const sampleState = generateNurseSchedulingState({
    staffCount: 30,
    year: 2026,
    month: 11,
    seed: 202611,
  });
  return exportNursesCsv(sampleState.nurses);
}

export function getSampleRequestsCsv(): string {
  const sampleState = generateNurseSchedulingState({
    staffCount: 30,
    year: 2026,
    month: 11,
    seed: 202611,
  });
  return exportRequestsCsv(sampleState.preferences);
}

export function getSampleRelationsCsv(): string {
  const sampleState = generateNurseSchedulingState({
    staffCount: 30,
    year: 2026,
    month: 11,
    seed: 202611,
  });
  return exportRelationsCsv(sampleState.relations);
}
