// Core data model for AP127 CMD V3.
// These are the NORMALIZED shapes produced by pipeline/ingest — the app never
// sees raw upstream data. Hours math must always use durMin (block time);
// airborneMin exists for display only.

export type FlightStatus = 'Pending' | 'Completed' | 'Canceled';

export interface FlightFlags {
  /** Row was an ACTUAL_ONLY_* post-flight record. */
  actualOnly?: boolean;
  /** Upstream stored the student/instructor with an "(Unplanned)" suffix. */
  unplanned?: boolean;
}

export interface Flight {
  id: string;
  date: string; // YYYY-MM-DD, validated at ingest
  status: FlightStatus;
  isSim: boolean;
  isStandby: boolean;
  start: string | null; // HH:MM
  end: string | null;
  durMin: number | null; // block time — the ONLY basis for hours math
  student: string | null; // display form, "(Unplanned)" stripped
  studentRaw?: string; // original value, present only when it differed
  studentKey: string | null; // canonical "FIRST L." key (nick/full-name bridged)
  nick?: string | null; // AP-127 call-sign when resolved from roster
  instructor: string | null;
  batch: string | null; // display form, e.g. "AP-127"
  batchKey: string | null; // normalized, e.g. "AP127"
  lesson: string | null;
  lessonNorm: string | null; // repeat marker stripped, e.g. "CDGL 04"
  cond: string | null; // condition, e.g. "Solo", "Night"
  type: string | null; // aircraft type
  tail: string | null;
  tkoff: string | null;
  ldgTime: string | null;
  airborneMin: number | null; // display only — never summed
  to: number | null;
  ldg: number | null;
  inst: number | string | null;
  flags?: FlightFlags;
}

export interface Instructor {
  name: string;
  [k: string]: unknown;
}

export interface Resource {
  tail: string;
  acType: string;
  isMaint: boolean;
  [k: string]: unknown;
}

export interface Leave {
  name: string;
  start: string;
  end: string;
  reason?: string;
}

export interface FlownLesson {
  lesson: string;
  lessonNorm: string;
  actualMins: number | null;
  date: string;
}

export interface PlannedLesson {
  lesson: string;
  date?: string;
  mins?: number | null;
}

export interface Student {
  catcId: string;
  name: string; // full name, e.g. "Akaravit Khwanngam"
  key: string; // "AKARAVIT K."
  nick: string; // call-sign from roster ('' if unknown)
  fi: string; // FI short code
  fiFull: string; // FI full name as it appears in ops
  se: string; // aircraft type, e.g. "DA40-TDI"
  batch: string;
  done: number;
  total: number;
  remaining: number;
  pct: number;
  nextLesson: string | null;
  flown: FlownLesson[];
  planned?: PlannedLesson[];
}

export interface CurriculumRow {
  lesson: string;
  lessonNorm: string;
  plannedMins: number | null;
  plannedDate: string | null;
}

// ── Data files (what the app fetches from /data) ─────────────────────────

export interface SourceStamp {
  url: string;
  fetchedAt: string; // ISO, when the pipeline fetched it
  upstreamFetchedAt?: string | null; // upstream's own timestamp when it carries one
}

export interface FlightsFile {
  schemaVersion: number;
  generatedAt: string;
  source: SourceStamp;
  flights: Flight[];
  instructors: Instructor[];
  resources: Resource[];
  leaves: Leave[];
}

export interface ProgressFile {
  schemaVersion: number;
  generatedAt: string;
  source: SourceStamp;
  students: Student[];
  curriculum: CurriculumRow[];
  rosterCoverage: {
    matched: number;
    missingFromFeed: string[];
    unknownInFeed: string[];
  };
}

export interface NgtBatchStudent {
  catcId: string;
  name: string;
  batch: string;
  done: number;
  total: number;
  flown: FlownLesson[];
  planned?: PlannedLesson[];
  [k: string]: unknown;
}

export interface NgtFile {
  schemaVersion: number;
  generatedAt: string;
  source: SourceStamp;
  batches: Record<string, NgtBatchStudent[]>; // ap124/ap126/ap127/ap129
  curricula: Record<string, CurriculumRow[]>; // cur124/cur126/cur127
  monthly: unknown[];
}

// ── Provenance manifest ───────────────────────────────────────────────────

export interface ValidationIssue {
  code: string;
  message: string;
  count?: number;
  samples?: string[];
}

export interface SourceManifest {
  sourceUrl: string;
  fetchedAt: string;
  upstreamFetchedAt?: string | null;
  contentHash: string; // sha256 of stable-stringified normalized payload
  lastChangedAt: string; // when the normalized content last actually changed
  records: Record<string, number>;
  validation: { errors: ValidationIssue[]; warnings: ValidationIssue[] };
  transforms?: Record<string, number>;
  diff?: {
    added: number;
    removed: number;
    changed: number;
    changedFields?: Record<string, number>;
  } | null;
}

export interface Manifest {
  schemaVersion: number;
  pipelineVersion: string;
  generatedAt: string;
  sources: {
    flights: SourceManifest;
    progress: SourceManifest;
    ngt: SourceManifest;
  };
}
