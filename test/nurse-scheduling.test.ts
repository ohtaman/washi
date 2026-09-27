import { describe, it, expect } from "vitest";
import { Model, sum } from "../src/modeler/index.js";

describe("Nurse Scheduling Problem (NSP)", () => {
  it("solves 10-nurse 7-day complex scheduling problem to optimality", async () => {
    const m = new Model({ name: "NurseScheduling", sense: "Minimize" });

    // 1. Sets and Parameters
    const nurses = [
      { id: "Alice",   isLeader: true,  maxDays: 5, targetDays: 5 },
      { id: "Bob",     isLeader: true,  maxDays: 5, targetDays: 5 },
      { id: "Charlie", isLeader: true,  maxDays: 5, targetDays: 5 },
      { id: "Diana",   isLeader: true,  maxDays: 5, targetDays: 5 },
      { id: "Evan",    isLeader: false, maxDays: 5, targetDays: 5 },
      { id: "Fiona",   isLeader: false, maxDays: 5, targetDays: 5 },
      { id: "George",  isLeader: false, maxDays: 5, targetDays: 5 },
      { id: "Hannah",  isLeader: false, maxDays: 5, targetDays: 5 },
      { id: "Ian",     isLeader: false, maxDays: 4, targetDays: 3 }, // Part-time
      { id: "Julia",   isLeader: false, maxDays: 4, targetDays: 3 }, // Part-time
    ];

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const numDays = days.length;
    const shifts = ["D", "E", "N"]; // D: Day (日勤), E: Evening (準夜勤), N: Night (夜勤)

    // Staffing requirements per day and shift
    // Mon-Fri: Day: 2, Evening: 2, Night: 1 (Total: 5 nurses/day)
    // Sat-Sun: Day: 2, Evening: 1, Night: 1 (Total: 4 nurses/day)
    const reqs: Record<string, { D: number; E: number; N: number }> = {
      Mon: { D: 2, E: 2, N: 1 },
      Tue: { D: 2, E: 2, N: 1 },
      Wed: { D: 2, E: 2, N: 1 },
      Thu: { D: 2, E: 2, N: 1 },
      Fri: { D: 2, E: 2, N: 1 },
      Sat: { D: 2, E: 1, N: 1 },
      Sun: { D: 2, E: 1, N: 1 },
    };

    // Nurse preferences (requests for time off)
    const offRequests = [
      { nurse: "Alice", day: "Sun", penalty: 20 },
      { nurse: "Bob", day: "Mon", penalty: 15 },
      { nurse: "Diana", day: "Fri", penalty: 25 },
      { nurse: "Evan", day: "Sat", penalty: 15 },
      { nurse: "George", day: "Wed", penalty: 20 },
    ];

    // 2. Decision Variables: x[nurse][day][shift] in {0, 1}
    const x: Record<string, Record<string, Record<string, any>>> = {};
    for (const n of nurses) {
      x[n.id] = {};
      for (const d of days) {
        x[n.id][d] = {};
        for (const s of shifts) {
          x[n.id][d][s] = m.addVar({
            name: `x_${n.id}_${d}_${s}`,
            type: "Binary",
          });
        }
      }
    }

    // 3. Hard Constraints

    // (H1) One shift per nurse per day
    for (const n of nurses) {
      for (const d of days) {
        m.addConstraint(
          sum(shifts, (s) => x[n.id][d][s]).le(1),
          `c_oneshift_${n.id}_${d}`
        );
      }
    }

    // (H2) Daily coverage requirements
    for (const d of days) {
      for (const s of shifts) {
        const minStaff = reqs[d][s as "D" | "E" | "N"];
        m.addConstraint(
          sum(nurses, (n) => x[n.id][d][s]).ge(minStaff),
          `c_coverage_${d}_${s}`
        );
      }
    }

    // (H3) Skill-mix requirement: At least 1 leader per day on Day shift, and at least 1 on Night/Evening
    const leaders = nurses.filter((n) => n.isLeader);
    for (const d of days) {
      // Day shift leader
      m.addConstraint(
        sum(leaders, (n) => x[n.id][d]["D"]).ge(1),
        `c_leader_day_${d}`
      );
      // Evening/Night combined at least 1 leader
      m.addConstraint(
        sum(leaders, (n) => x[n.id][d]["E"].add(x[n.id][d]["N"])).ge(1),
        `c_leader_night_${d}`
      );
    }

    // (H4) Maximum working days per week
    for (const n of nurses) {
      const allShifts = [];
      for (const d of days) {
        for (const s of shifts) {
          allShifts.push(x[n.id][d][s]);
        }
      }
      m.addConstraint(sum(allShifts).le(n.maxDays), `c_maxdays_${n.id}`);
    }

    // (H5) Shift transitions / Rest hours:
    // - Night (N) -> cannot work Day (D) or Evening (E) next day
    // - Evening (E) -> cannot work Day (D) next day
    for (const n of nurses) {
      for (let t = 0; t < numDays - 1; t++) {
        const today = days[t];
        const tomorrow = days[t + 1];

        // N -> D prohibited
        m.addConstraint(
          x[n.id][today]["N"].add(x[n.id][tomorrow]["D"]).le(1),
          `c_rest_ND_${n.id}_${today}`
        );
        // N -> E prohibited
        m.addConstraint(
          x[n.id][today]["N"].add(x[n.id][tomorrow]["E"]).le(1),
          `c_rest_NE_${n.id}_${today}`
        );
        // E -> D prohibited
        m.addConstraint(
          x[n.id][today]["E"].add(x[n.id][tomorrow]["D"]).le(1),
          `c_rest_ED_${n.id}_${today}`
        );
      }
    }

    // (H6) Maximum consecutive working days: At most 4 consecutive working days
    // Over any 5-day window, sum of shifts <= 4
    for (const n of nurses) {
      for (let t = 0; t <= numDays - 5; t++) {
        const windowShifts = [];
        for (let k = 0; k < 5; k++) {
          const d = days[t + k];
          for (const s of shifts) {
            windowShifts.push(x[n.id][d][s]);
          }
        }
        m.addConstraint(sum(windowShifts).le(4), `c_consec_${n.id}_d${t}`);
      }
    }

    // (H7) Night shift limit: No more than 2 consecutive night shifts
    for (const n of nurses) {
      for (let t = 0; t <= numDays - 3; t++) {
        m.addConstraint(
          x[n.id][days[t]]["N"]
            .add(x[n.id][days[t + 1]]["N"])
            .add(x[n.id][days[t + 2]]["N"])
            .le(2),
          `c_night_consec_${n.id}_d${t}`
        );
      }
    }

    // 4. Objective: Minimize off-request penalties + night shift loads
    const penaltyTerms: any[] = [];

    // Off-request penalties (Soft constraint: respect nurse holiday requests)
    for (const req of offRequests) {
      for (const s of shifts) {
        penaltyTerms.push(x[req.nurse][req.day][s].mul(req.penalty));
      }
    }

    // Small cost on night shifts to balance workload
    for (const n of nurses) {
      for (const d of days) {
        penaltyTerms.push(x[n.id][d]["N"].mul(1));
      }
    }

    m.minimize(sum(penaltyTerms));

    // 5. Solve with HiGHS
    const status = await m.optimize();

    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBeGreaterThan(0);

    // Print schedule table for verification
    console.log("\n--- OPTIMAL NURSE SCHEDULE ---");
    for (const n of nurses) {
      const schedule = days.map((d) => {
        for (const s of shifts) {
          if (x[n.id][d][s].value === 1) return s;
        }
        return "-";
      });
      console.log(`${n.id.padEnd(8)}: ${schedule.join("  ")}`);
    }
  });
});
