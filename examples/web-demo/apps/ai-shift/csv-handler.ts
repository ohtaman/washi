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

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-（）()・/]/g, "");
}

export function parseBooleanToken(token: string | undefined, defaultVal = false): boolean {
  if (!token) return defaultVal;
  const t = token.trim().toLowerCase();
  if (["1", "true", "yes", "y", "t", "可", "○", "はい", "on", "確定"].includes(t)) return true;
  if (["0", "false", "no", "n", "f", "不可", "×", "いいえ", "off", "希望"].includes(t)) return false;
  return defaultVal;
}

export function parseShiftToken(token: string | undefined): ShiftCode {
  if (!token) return "O";
  const t = token.trim().toUpperCase();
  if (t === "D" || token.includes("日勤") || token === "日") return "D";
  if (t === "E" || token.includes("準夜") || token === "準") return "E";
  if (t === "N" || token.includes("深夜") || token === "深") return "N";
  if (t === "O" || token.includes("公休") || token.includes("休") || token === "休") return "O";
  if (t === "W" || token.includes("勤務") || token === "勤") return "W";
  if (t === "EN" || token.includes("夜勤") || token === "夜") return "EN";
  return token.trim();
}

export function parseSkillToken(token: string): NurseSkill | null {
  const t = token.trim();
  if (!t) return null;
  // Exact match for known identifiers first (preserves "leader", "team_A", "team_B", "mid", "newcomer", "leader_cap", "icu_er", "ventilator")
  if (/^[a-zA-Z0-9_\-]+$/.test(t)) {
    return t as NurseSkill;
  }
  // Japanese alias mappings
  if (t.includes("リーダー")) return "leader_cap";
  if (t.includes("救急") || t.includes("重症") || t.includes("ICU")) return "icu_er";
  if (t.includes("呼吸器")) return "ventilator";
  if (t.includes("チームA") || t.includes("Aチーム")) return "team_A";
  if (t.includes("チームB") || t.includes("Bチーム")) return "team_B";
  if (t.includes("新人")) return "newcomer";
  if (t.includes("中堅")) return "mid";
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
    errors.push("CSVファイルが空です。");
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
    const id = getCol(row, "id", "看護師ID", "ID", "スタッフID");
    const name = getCol(row, "name", "氏名", "名前");

    if (!id || !name) {
      warnings.push(`行 ${r + 1}: IDまたは氏名が空のためスキップしました。`);
      continue;
    }

    if (seenIds.has(id)) {
      errors.push(`行 ${r + 1}: 看護師ID "${id}" が重複しています。`);
      continue;
    }
    seenIds.add(id);

    const kana = getCol(row, "kana", "フリガナ", "ふりがな", "かな") ?? name;
    const skillsRaw = getCol(row, "skills", "スキル", "保有スキル") ?? "";
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

    const weekdayOnly = parseBooleanToken(getCol(row, "weekdayonly", "平日専従", "平日のみ"), false);
    const holidaysOff = parseBooleanToken(getCol(row, "holidaysoff", "祝日休", "祝日休み"), false);

    const prevMonthShiftsRaw = getCol(row, "prevmonthshifts", "前月最終勤務", "前月末シフト") ?? "";
    let prevMonthShifts: ShiftCode[] = [];
    if (prevMonthShiftsRaw) {
      prevMonthShifts = prevMonthShiftsRaw.split(/[;,]/).map((s) => parseShiftToken(s));
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
  knownNurseIds?: Set<string>
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
    const nurseId = getCol(row, "nurseid", "看護師id", "スタッフid", "id");
    const dayRaw = getCol(row, "day", "日付", "日");
    const shiftRaw = getCol(row, "shift", "シフト", "希望シフト");

    if (!nurseId || !dayRaw) {
      warnings.push(`行 ${r + 1}: nurseIdまたはdayが空のためスキップしました。`);
      continue;
    }

    if (knownNurseIds && !knownNurseIds.has(nurseId)) {
      errors.push(`行 ${r + 1}: スタッフ名簿に存在しない看護師ID "${nurseId}" です。`);
      continue;
    }

    const day = parseInt(dayRaw, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      errors.push(`行 ${r + 1}: 不正な日付 "${dayRaw}" です (1〜31の範囲を指定してください)。`);
      continue;
    }

    const shift = parseShiftToken(shiftRaw);
    const isHard = parseBooleanToken(getCol(row, "ishard", "確定フラグ", "確定", "必須"), false);
    const reason = getCol(row, "reason", "理由", "備考") ?? (isHard ? "確定希望" : "希望シフト");

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
  knownNurseIds?: Set<string>
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
    const typeRaw = getCol(row, "type", "種別", "タイプ") ?? "ng_pair";
    const nurseA = getCol(row, "nursea", "スタッフa", "看護師a", "ペア1");
    const nurseB = getCol(row, "nurseb", "スタッフb", "看護師b", "ペア2");

    if (!nurseA || !nurseB) {
      warnings.push(`行 ${r + 1}: nurseAまたはnurseBが空のためスキップしました。`);
      continue;
    }

    if (nurseA === nurseB) {
      errors.push(`行 ${r + 1}: 同一人物 "${nurseA}" 同士の自己ペアは指定できません。`);
      continue;
    }

    if (knownNurseIds) {
      if (!knownNurseIds.has(nurseA)) {
        errors.push(`行 ${r + 1}: スタッフ名簿に存在しない看護師A "${nurseA}" です。`);
        continue;
      }
      if (!knownNurseIds.has(nurseB)) {
        errors.push(`行 ${r + 1}: スタッフ名簿に存在しない看護師B "${nurseB}" です。`);
        continue;
      }
    }

    const type = typeRaw.includes("preceptor") || typeRaw.includes("指導") ? "preceptor" : "ng_pair";
    const shiftsRaw = getCol(row, "shifts", "対象シフト", "シフト") ?? "E;N";
    const shifts = shiftsRaw.split(/[;,]/).map((s) => parseShiftToken(s));
    const isHard = parseBooleanToken(getCol(row, "ishard", "確定フラグ", "必須"), true);
    const reason = getCol(row, "reason", "理由", "備考") ?? (type === "preceptor" ? "プリセプター指導ペア" : "相性NGペア");

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
  numDays = 30
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (nurses.length === 0) {
    errors.push("スタッフが1名も登録されていません。");
    return { valid: false, errors, warnings };
  }

  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  if (nurseMap.size < nurses.length) {
    errors.push("スタッフIDに重複があります。");
  }

  for (const pref of preferences) {
    if (!nurseMap.has(pref.nurseId)) {
      errors.push(`希望シフトの看護師ID "${pref.nurseId}" はスタッフ名簿に存在しません。`);
    }
    if (pref.day < 1 || pref.day > numDays) {
      errors.push(`希望シフトの日付 "${pref.day}" は月の日数(1〜${numDays})の範囲外です。`);
    }
  }

  for (const rel of relations) {
    if (!nurseMap.has(rel.nurseA)) {
      errors.push(`ペア制約の看護師A "${rel.nurseA}" はスタッフ名簿に存在しません。`);
    }
    if (!nurseMap.has(rel.nurseB)) {
      errors.push(`ペア制約の看護師B "${rel.nurseB}" はスタッフ名簿に存在しません。`);
    }
    if (rel.nurseA === rel.nurseB) {
      errors.push(`自己ペア制約 "${rel.nurseA}" は無効です。`);
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
