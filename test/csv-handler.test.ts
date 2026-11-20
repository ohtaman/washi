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
  parseSlotToken,
  validateTimetableDataset,
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
    expect(profsCsv).toContain("unavailableSlots");
    expect(profsCsv).toContain("P01");
    const parsedProfs = parseProfessorsCsv(profsCsv);
    expect(parsedProfs.errors).toHaveLength(0);
    expect(parsedProfs.professors).toHaveLength(defaultState.professors.length);
    const p1 = parsedProfs.professors.find((p) => p.id === "P01");
    expect(p1?.name).toBe("Kenichi Sato");
    expect(p1?.employment).toBe("full_time");
    expect(p1?.unavailableSlots).toEqual([
      { day: "Wed", period: 5, reason: "Faculty Meeting" },
    ]);
    const p2 = parsedProfs.professors.find((p) => p.id === "P02");
    expect(p2?.unavailableSlots).toEqual([
      { day: "Wed", period: 5, reason: "Faculty Meeting" },
      { day: "Mon", period: 1, reason: "Joint Research Sync" },
    ]);

    // Rooms
    const roomsCsv = exportRoomsCsv(defaultState.rooms);
    expect(roomsCsv).toContain("id,name,capacity,roomType,equipment,building");
    expect(roomsCsv).toContain("R101");
    const parsedRooms = parseRoomsCsv(roomsCsv);
    expect(parsedRooms.errors).toHaveLength(0);
    expect(parsedRooms.rooms).toHaveLength(defaultState.rooms.length);
    const r101 = parsedRooms.rooms.find((r) => r.id === "R101");
    expect(r101?.capacity).toBe(150);
    expect(r101?.roomType).toBe("large_hall");
    expect(r101?.equipment).toContain("projector");
    expect(r101?.building).toBe("CS Bldg 1F");

    // Courses
    const coursesCsv = exportCoursesCsv(defaultState.courses);
    expect(coursesCsv).toContain("id,title,professorId");
    expect(coursesCsv).toContain("C01");
    const knownIds = new Set(parsedProfs.professors.map((p) => p.id));
    const parsedCourses = parseCoursesCsv(coursesCsv, knownIds);
    expect(parsedCourses.errors).toHaveLength(0);
    expect(parsedCourses.courses).toHaveLength(defaultState.courses.length);
    const c01 = parsedCourses.courses.find((c) => c.id === "C01");
    expect(c01?.title).toBe("Intro to Computer Science");
    expect(c01?.professorId).toBe(defaultState.courses[0].professorId);
  });

  it("parses Japanese header CSV and tolerant tokens correctly", () => {
    const profCsvJa = `
教員ID,氏名,役職,雇用形態,不可曜日,1限回避,5限回避,1日最大\u30B3\u30DE数
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

  it("parses unavailable slot tokens in various Japanese and English formats", () => {
    expect(parseSlotToken("Wed-5(教授会定例)")).toEqual({
      day: "Wed",
      period: 5,
      reason: "教授会定例",
    });
    expect(parseSlotToken("水曜5限")).toEqual({
      day: "Wed",
      period: 5,
    });
    expect(parseSlotToken("Mon-1 (Meeting)")).toEqual({
      day: "Mon",
      period: 1,
      reason: "Meeting",
    });
    expect(parseSlotToken("金:3")).toEqual({
      day: "Fri",
      period: 3,
    });
    expect(parseSlotToken("invalid")).toBeNull();
  });

  it("validates cross-dataset references regardless of loading order", () => {
    const defaultState = generateTimetableState();
    const validErrors = validateTimetableDataset(
      defaultState.professors,
      defaultState.rooms,
      defaultState.courses
    );
    expect(validErrors).toHaveLength(0);

    // Mismatched professor reference
    const badCourses = [
      {
        ...defaultState.courses[0],
        professorId: "P_NONEXISTENT",
      },
    ];
    const errors = validateTimetableDataset(
      defaultState.professors,
      defaultState.rooms,
      badCourses
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("P_NONEXISTENT");
  });

  it("rejects duplicate IDs in individual CSV parsers and dataset validation", () => {
    const dupProfCsv = `
id,name
P01,Kenichi Sato
P01,Kenichi Sato Jr
`.trim();
    const profRes = parseProfessorsCsv(dupProfCsv);
    expect(profRes.errors.length).toBeGreaterThan(0);
    expect(profRes.errors[0]).toContain("Duplicate");

    const dupRoomCsv = `
id,name,capacity
R101,Hall 101,100
R101,Hall 101B,100
`.trim();
    const roomRes = parseRoomsCsv(dupRoomCsv);
    expect(roomRes.errors.length).toBeGreaterThan(0);
    expect(roomRes.errors[0]).toContain("Duplicate");

    const dupCourseCsv = `
id,title,professorId
C01,Algorithms,P01
C01,Data Structures,P01
`.trim();
    const courseRes = parseCoursesCsv(dupCourseCsv);
    expect(courseRes.errors.length).toBeGreaterThan(0);
    expect(courseRes.errors[0]).toContain("Duplicate");

    const defaultState = generateTimetableState();
    const dupCourseDataset = [
      ...defaultState.courses,
      { ...defaultState.courses[0] },
    ];
    const dsErrors = validateTimetableDataset(
      defaultState.professors,
      defaultState.rooms,
      dupCourseDataset
    );
    expect(dsErrors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("rejects invalid or empty present CSV fields without silent coercions or auto-inference", () => {
    // 1. Professors CSV: invalid employment, unavailableDays, unavailableSlots, booleans, and maxSessionsPerDay
    const badProfCsv = `
id,name,title,employment,unavailableDays,unavailableSlots,avoidPeriod1,avoidPeriod5,maxSessionsPerDay
P01,Prof Good,Prof,full_time,,,false,false,2
P02,Prof Bad Emp,Prof,contractor,,,false,false,2
P03,Prof Bad Day,Prof,full_time,Funday,,false,false,2
P04,Prof Bad Slot,Prof,full_time,,Mon-9,false,false,2
P05,Prof Bad Flag,Prof,full_time,,,maybe,false,2
P06,Prof Bad Max 0,Prof,full_time,,,false,false,0
P07,Prof Bad Max NaN,Prof,full_time,,,false,false,many
P08,Prof Empty Max,Prof,full_time,,,false,false,
`.trim();
    const badProfRes = parseProfessorsCsv(badProfCsv);
    expect(badProfRes.professors.map((p) => p.id)).toEqual(["P01"]);
    expect(badProfRes.errors).toHaveLength(7);

    // 2. Rooms CSV: reads building column, defaults omitted/empty building to "", rejects invalid roomType/equipment/substring collision
    const roomsWithBuildingCsv = `
id,name,capacity,roomType,equipment,building
R101,Room 101,80,medium_room,projector;mic,North Wing 2F
R102,Room 102,40,seminar_room,,
`.trim();
    const okRooms = parseRoomsCsv(roomsWithBuildingCsv);
    expect(okRooms.errors).toHaveLength(0);
    expect(okRooms.rooms).toHaveLength(2);
    expect(okRooms.rooms[0].building).toBe("North Wing 2F");
    expect(okRooms.rooms[0].roomType).toBe("medium_room");
    expect(okRooms.rooms[1].building).toBe("");

    const roomsWithoutBuildingCol = `
id,name,capacity,roomType,equipment
R201,Room 201,60,pc_lab,pc_terminal
`.trim();
    const okNoBld = parseRoomsCsv(roomsWithoutBuildingCol);
    expect(okNoBld.errors).toHaveLength(0);
    expect(okNoBld.rooms[0].building).toBe("");

    const badRoomCsv = `
id,name,capacity,roomType,equipment,building
R301,Bad Type,50,auditorium,projector,Main
R302,Substring Type,50,non_pc_lab,projector,Main
R303,Empty Type,50,,projector,Main
R304,Bad Equip,50,medium_room,laser_beam,Main
R305,Zero Cap,0,medium_room,projector,Main
`.trim();
    const badRoomRes = parseRoomsCsv(badRoomCsv);
    expect(badRoomRes.rooms).toHaveLength(0);
    expect(badRoomRes.errors).toHaveLength(5);

    // 3. Courses CSV: skips unknown professorId, rejects invalid cohorts/category/enrollment/sessionsPerWeek/equipment/roomType, and removes pc_lab auto-inference
    const knownProfs = new Set(["P01"]);
    const validLabNoReqRoomType = `
id,title,professorId,cohorts,category,enrollment,sessionsPerWeek,requiredEquipment,requiredRoomType
C10,Systems Lab,P01,Y2,lab_exercise,40,1,pc_terminal,
`.trim();
    const labRes = parseCoursesCsv(validLabNoReqRoomType, knownProfs);
    expect(labRes.errors).toHaveLength(0);
    expect(labRes.courses).toHaveLength(1);
    expect(labRes.courses[0].requiredRoomType).toBeUndefined();

    const badCourseCsv = `
id,title,professorId,cohorts,category,enrollment,sessionsPerWeek,requiredEquipment,requiredRoomType
C01,Unknown Prof,P999,Y1,compulsory,50,1,projector,
C02,Empty Cohorts,P01,,compulsory,50,1,projector,
C03,Invalid Cohort,P01,Y9,compulsory,50,1,projector,
C04,Invalid Category,P01,Y1,workshop,50,1,projector,
C05,Zero Enrollment,P01,Y1,elective,0,1,projector,
C06,NaN Enrollment,P01,Y1,elective,many,1,projector,
C07,Bad Sessions,P01,Y1,elective,30,3,projector,
C08,Bad Equipment,P01,Y1,elective,30,1,quantum_rig,
C09,Bad ReqRoomType,P01,Y1,elective,30,1,projector,gymnasium
`.trim();
    const badCourseRes = parseCoursesCsv(badCourseCsv, knownProfs);
    expect(badCourseRes.courses).toHaveLength(0);
    expect(badCourseRes.errors).toHaveLength(9);
  });
});
