export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Day = (typeof DAYS)[number];

export interface StaffMember {
  name: string;
  isSenior: boolean;
  dailyWage: number;
  maxShifts: number;
}

export interface DayOffRequest {
  staff: string;
  day: Day;
  reason?: string;
}

export interface ShiftRequirements {
  staffList: StaffMember[];
  requiredCoverage: Record<Day, number>;
  seniorRequiredDaily: boolean;
  dayOffRequests: DayOffRequest[];
}

export interface ShiftAssignment {
  staff: string;
  isSenior: boolean;
  schedule: Record<Day, boolean>;
  totalDays: number;
  maxShifts: number;
  cost: number;
}

export interface ShiftSolveResult {
  status: "Optimal" | "Infeasible" | "Error";
  buildTimeMs: number;
  solveTimeMs: number;
  objectiveValue?: number;
  assignments?: ShiftAssignment[];
  dailyCoverage?: Record<Day, { current: number; required: number; seniors: number }>;
  unsatCore?: string[];
  conflictDetails?: {
    conflictingConstraints: string[];
    explanation: string;
  };
  modelCodePreview?: string;
}

export interface ExtractedPlanIntent {
  action: "create" | "modify" | "relax";
  dayOffRequests?: DayOffRequest[];
  coverageOverrides?: Partial<Record<Day, number>>;
  seniorRequiredDaily?: boolean;
  summary: string;
}

export type NanoAvailability = "readily" | "after-download" | "no";

export interface NanoSessionWrapper {
  isMock: boolean;
  prompt(text: string, options?: { responseConstraint?: any; signal?: AbortSignal }): Promise<string>;
  promptStreaming(text: string, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy(): void;
}

/**
 * Formal JSON Schema for Gemini Nano Structured Output (Prompt API responseConstraint)
 */
export const SHIFT_INTENT_JSON_SCHEMA = {
  type: "object",
  required: ["action", "summary"],
  properties: {
    action: {
      type: "string",
      enum: ["create", "modify", "relax"],
      description: "Action type: create fresh requests, modify existing, or relax constraints",
    },
    dayOffRequests: {
      type: "array",
      description: "List of staff requested days off",
      items: {
        type: "object",
        required: ["staff", "day"],
        properties: {
          staff: {
            type: "string",
            enum: ["Alice", "Bob", "Charlie", "Diana", "Evan"],
            description: "Target staff member name",
          },
          day: {
            type: "string",
            enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            description: "Day of the week requested off",
          },
          reason: {
            type: "string",
            description: "Reason for the vacation request",
          },
        },
      },
    },
    coverageOverrides: {
      type: "object",
      description: "Optional override for headcount requirement on a specific day",
      properties: {
        Mon: { type: "number" },
        Tue: { type: "number" },
        Wed: { type: "number" },
        Thu: { type: "number" },
        Fri: { type: "number" },
        Sat: { type: "number" },
        Sun: { type: "number" },
      },
    },
    seniorRequiredDaily: {
      type: "boolean",
      description: "Whether mandatory senior duty is strictly enforced",
    },
    summary: {
      type: "string",
      description: "Brief summary of the parsed intent",
    },
  },
};

