import { describe, it, expect } from "vitest";
import {
  exportCoursesCsv,
  exportProfessorsCsv,
  exportRoomsCsv,
  getSampleCoursesCsv,
  getSampleProfessorsCsv,
  getSampleRoomsCsv,
  parseCoursesCsv,
  parseCsvRows,
  parseProfessorsCsv,
  parseRoomsCsv,
} from "../examples/web-demo/apps/ai-timetable/csv-handler";
import {
  createBlankTimetableState,
  generateTimetableState,
} from "../examples/web-demo/apps/ai-timetable/generator";
import { solveTimetableWithWashi } from "../examples/web-demo/apps/ai-timetable/solver";

describe("Timetable CSV Handler & Blank Slate Mode", () => {
  it("initializes a valid blank timetable state and safely handles solve without crashing", async () => {
    const blank = createBlankTimetableState();
    expect(blank.courses.length).toBe(0);
    expect(blank.professors.length).toBe(0);
    expect(blank.rooms.length).toBe(0);

    const outcome = await solveTimetableWithWashi(blank);
    expect(outcome.status).toBe("Optimal");
    expect(outcome.numVariables).toBe(0);
    expect(outcome.timetable?.sessions.length).toBe(0);
    expect(outcome.evaluation?.valid).toBe(true);
  });

  it("exports sample professors, rooms, and courses to valid CSV and parses them back losslessly", () => {
    const defaultState = generateTimetableState();

    // Professors
    const profsCsv = exportProfessorsCsv(defaultState.professors);
    expect(profsCsv).toContain("id,name,title");
    expect(profsCsv).toContain("P01");
    const parsedProfs = parseProfessorsCsv(profsCsv);
    expect(parsedProfs.errors).toHaveLength(0);
    expect(parsedProfs.professors).toHaveLength(defaultState.professors.length);
    const p1 = parsedProfs.professors.find((p) => p.id === "P01");
    expect(p1?.name).toBe("佐藤 健一");
    expect(p1?.employment).toBe("full_time");

    // Rooms
    const roomsCsv = exportRoomsCsv(defaultState.rooms);
    expect(roomsCsv).toContain("id,name,capacity");
    expect(roomsCsv).toContain("R101");
    const parsedRooms = parseRoomsCsv(roomsCsv);
    expect(parsedRooms.errors).toHaveLength(0);
    expect(parsedRooms.rooms).toHaveLength(defaultState.rooms.length);
    const r101 = parsedRooms.rooms.find((r) => r.id === "R101");
    expect(r101?.capacity).toBe(150);
    expect(r101?.roomType).toBe("large_hall");
    expect(r101?.equipment).toContain("projector");

    // Courses
    const coursesCsv = exportCoursesCsv(defaultState.courses);
    expect(coursesCsv).toContain("id,title,professorId");
    expect(coursesCsv).toContain("C01");
    const knownIds = new Set(parsedProfs.professors.map((p) => p.id));
    const parsedCourses = parseCoursesCsv(coursesCsv, knownIds);
    expect(parsedCourses.errors).toHaveLength(0);
    expect(parsedCourses.courses).toHaveLength(defaultState.courses.length);
    const c01 = parsedCourses.courses.find((c) => c.id === "C01");
    expect(c01?.title).toBe("情報科学概論");
    expect(c01?.professorId).toBe(defaultState.courses[0].professorId);
  });

  it("parses Japanese header CSV and tolerant tokens correctly", () => {
    const profCsvJa = `
教員ID,氏名,役職,雇用形態,不可曜日,1限回避,5限回避,1日最大コマ数
P99,山田 太郎,非常勤講師,非常勤,"月;金",true,false,2
`.trim();

    const parsed = parseProfessorsCsv(profCsvJa);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.professors).toHaveLength(1);
    expect(parsed.professors[0].name).toBe("山田 太郎");
    expect(parsed.professors[0].employment).toBe("adjunct");
    expect(parsed.professors[0].unavailableDays).toEqual(["Mon", "Fri"]);
    expect(parsed.professors[0].avoidPeriod1).toBe(true);
    expect(parsed.professors[0].maxSessionsPerDay).toBe(2);
  });

  it("handles CSV line tokenizer quotes and commas correctly", () => {
    const csv = `
"id","name","desc"
"1","Smith, John","Hello ""World""
multiline"
"2","Tanaka","Simple"
`.trim();

    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1][1]).toBe("Smith, John");
    expect(rows[1][2]).toBe('Hello "World"\nmultiline');
    expect(rows[2][1]).toBe("Tanaka");
  });
});
