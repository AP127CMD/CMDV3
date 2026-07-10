// Raw upstream payload parsing + zod validation. These are the SAME three
// upstreams V2 mirrors (read-only; the dispatcher chain is untouched).

import { z } from 'zod';

export const UPSTREAMS = {
  flights: 'https://raw.githubusercontent.com/AP127CMD/CMD_CTR/main/flight-data.js',
  progress: 'https://ap127-data-api.anusorn-tanmetha.workers.dev',
  // Pages URL, not raw.github — CF Pages deploys ~60s after DB001 push while
  // the raw.github CDN can lag 1–5 min (documented in V2's refresh script).
  ngt: 'https://ap127-db001.pages.dev/cache.json',
} as const;

// ── Raw schemas (minimal required fields; everything else passes through) ──

export const rawFlightSchema = z
  .object({
    id: z.string(),
    date: z.string(),
    status: z.string(),
    isSim: z.boolean().optional().default(false),
    isStandby: z.boolean().optional().default(false),
    start: z.string().nullable().optional(),
    end: z.string().nullable().optional(),
    durMin: z.number().nullable().optional(),
    duration: z.string().nullable().optional(),
    student: z.string().nullable().optional(),
    instructor: z.string().nullable().optional(),
    batch: z.string().nullable().optional(),
    lesson: z.string().nullable().optional(),
    cond: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    tail: z.string().nullable().optional(),
    tkoff: z.string().nullable().optional(),
    ldgTime: z.string().nullable().optional(),
    airborne: z.string().nullable().optional(),
    to: z.number().nullable().optional(),
    ldg: z.number().nullable().optional(),
    inst: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough();

export const rawFlightDataSchema = z
  .object({
    fetchedAt: z.string().optional(),
    tz: z.string().optional(),
    flights: z.array(rawFlightSchema),
    instructors: z.array(z.object({ name: z.string() }).passthrough()).default([]),
    resources: z
      .array(z.object({ tail: z.string(), acType: z.string().optional().default(''), isMaint: z.boolean().optional().default(false) }).passthrough())
      .default([]),
    leaves: z
      .array(z.object({ name: z.string(), start: z.string(), end: z.string(), reason: z.string().optional() }).passthrough())
      .default([]),
  })
  .passthrough();

export type RawFlightData = z.infer<typeof rawFlightDataSchema>;
export type RawFlight = z.infer<typeof rawFlightSchema>;

export const rawFlownSchema = z
  .object({
    lesson: z.string(),
    actual_ft: z.string().nullable().optional(),
    actual_mins: z.number().nullable().optional(),
    date: z.string(),
  })
  .passthrough();

export const rawProgressStudentSchema = z
  .object({
    catc_id: z.string(),
    name: z.string(),
    batch: z.string().optional().default(''),
    done: z.number(),
    total: z.number(),
    remaining: z.number().optional(),
    pct: z.number().optional(),
    next_lesson: z.string().nullable().optional(),
    flown: z.array(rawFlownSchema).default([]),
    planned: z
      .array(z.object({ date: z.string().optional(), lesson: z.string(), mins: z.number().nullable().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

export const rawCurriculumSchema = z
  .object({
    lesson: z.string(),
    planned_mins: z.number().nullable().optional(),
    planned_date: z.string().nullable().optional(),
  })
  .passthrough();

export const rawProgressSchema = z
  .object({
    ap127: z.array(rawProgressStudentSchema),
    cur127: z.array(rawCurriculumSchema).default([]),
    _updated: z.string().optional(),
  })
  .passthrough();

export type RawProgress = z.infer<typeof rawProgressSchema>;
export type RawProgressStudent = z.infer<typeof rawProgressStudentSchema>;

export const rawNgtSchema = z
  .object({
    ap124: z.array(rawProgressStudentSchema).default([]),
    ap126: z.array(rawProgressStudentSchema).default([]),
    ap127: z.array(rawProgressStudentSchema),
    ap129: z.array(rawProgressStudentSchema).default([]),
    cur124: z.array(rawCurriculumSchema).default([]),
    cur126: z.array(rawCurriculumSchema).default([]),
    cur127: z.array(rawCurriculumSchema).default([]),
    monthly: z.unknown().optional(),
    cap: z.unknown().optional(),
    _updated: z.string().optional(),
  })
  .passthrough();

export type RawNgt = z.infer<typeof rawNgtSchema>;

// ── Parsers ────────────────────────────────────────────────────────────────

/** flight-data.js is a JS file: `window.FLIGHT_DATA = {...}` (optionally `;`). */
export function parseFlightDataJs(text: string): RawFlightData {
  const marker = 'window.FLIGHT_DATA =';
  const at = text.indexOf(marker);
  if (at === -1) throw new Error('missing "window.FLIGHT_DATA =" wrapper');
  const body = text
    .slice(at + marker.length)
    .trim()
    .replace(/;\s*$/, '');
  return rawFlightDataSchema.parse(JSON.parse(body));
}

export function parseProgressJson(text: string): RawProgress {
  return rawProgressSchema.parse(JSON.parse(text));
}

export function parseNgtJson(text: string): RawNgt {
  return rawNgtSchema.parse(JSON.parse(text));
}
