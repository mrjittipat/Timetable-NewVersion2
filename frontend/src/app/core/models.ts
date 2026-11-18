export type View = 'group' | 'teacher' | 'room';
export type Role = 'admin' | 'teacher' | 'viewer';
export type Term = '1' | '2';

export interface TermSummary {
  term: Term;
  label: string;
  semester: string;
  year: string;
  publicEnabled: boolean;
  hasTimetable: boolean;
  validationPassed: boolean;
  rowCount: number;
  updatedAt: string | null;
  seed: number;
  subjects: number;
  registrations: number;
}

export interface User {
  username: string;
  name: string;
  role: Role;
  teacher_id: string;
  avatar: string;
  mustChangePassword: boolean;
  createdAt?: string;
}

export interface WarningItem {
  level: 'warn' | 'error';
  message: string;
}

export interface EntitySchema {
  file: string;
  aliases: string[];
  fields: string[];
  key: string[];
  int: string[];
}

export type DataTableMap = Record<string, Record<string, string | number>[]>;

export interface DataResponse {
  data: DataTableMap;
  schema: Record<string, EntitySchema>;
  warnings: WarningItem[];
  summary: {
    teachers: number;
    leaders: number;
    rooms: number;
    groups: number;
    subjects: number;
    registrations: number;
    timeslots: number;
    totalPeriods: number;
  };
}

export interface OutputRow {
  group_id: string;
  timeslot_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string;
}

export interface Check {
  id: string;
  no: number;
  name: string;
  type: 'integrity' | 'basic' | 'special';
  enabled: boolean;
  passed: boolean;
  violationCount: number;
  violations: string[];
}

export interface Validation {
  passed: boolean;
  checks: Check[];
  stats: { rows: number; groups: number };
}

export interface DocumentInfo {
  college: string;
  semester: string;
  year: string;
  curriculumHeadName: string;
  deputyName: string;
  directorName: string;
  publicEnabled: boolean;
  publicBaseUrl: string;
}

export interface Config {
  constraints: Record<string, boolean>;
  params: {
    homeroomPeriod: number;
    breakPeriod: number;
    maxPerDay: number;
    maxBlock: number;
    latestPreferredPeriod: number;
    leaderMinPeriods: number;
    leaderMaxPeriods: number;
    teacherMinPeriods: number;
    teacherMaxPeriods: number;
    timeLimitSec: number;
    seed: number;
  };
  document: DocumentInfo;
  savedSeeds: SavedSeed[];
}

export interface SavedSeed {
  id: string;
  name: string;
  seed: number;
  constraints: Record<string, boolean>;
  params: Record<string, number>;
  softCost: number | null;
  savedAt: string;
}

export interface SolveStats {
  courses: number;
  blocks: number;
  restarts: number;
  nodes: number;
  saIterations: number;
  softCostBefore: number;
  softCostAfter: number;
  seconds: number;
  seed: number;
  constraints: Record<string, boolean>;
  params: Record<string, number>;
}

export interface TimetableMeta {
  stats?: SolveStats;
  validationPassed?: boolean;
  source?: 'solver' | 'manual';
  bestOf?: number;
  updatedAt?: string;
}

export interface TimetableResponse {
  rows: OutputRow[];
  meta: TimetableMeta | null;
  validation: Validation | null;
}

export interface SolveResponse {
  status: 'success' | 'failed';
  message: string;
  rows: OutputRow[];
  warnings: WarningItem[];
  errors?: string[];
  stats: SolveStats;
  validation: Validation | null;
  log?: string[];
}

export interface DiagnosisResponse {
  feasible: boolean;
  culprits: string[];
  probes: { label: string; ok: boolean; seconds: number }[];
  findings: { level: 'error' | 'warn' | 'ok'; area: string; message: string }[];
  suggestions: string[];
}

export interface BestSeedResponse {
  status: 'success' | 'failed';
  message: string;
  best: { seed: number; softCost: number } | null;
  results: { seed: number; ok: boolean; softCost: number | null; seconds: number }[];
  seconds: number;
  validation: Validation | null;
}

export interface EntityRef {
  id: string;
  title: string;
  subtitle: string;
  heading: string;
  info: [string, string][];
  signer: string;
  signerName: string;
}

export interface GridSpan {
  start: number;
  span: number;
  subject_id: string;
  subject_name: string;
  teacher_id: string;
  teacher: string;
  room: string;
  groups: string[];
  clash: boolean;
}

export interface Grid {
  entity?: EntityRef;
  days: { key: string; label: string }[];
  periods: { period: number; start: string; end: string; isHomeroom: boolean; isBreak: boolean; breakLabel: string }[];
  cells: GridSpan[][];
  total: number;
  updatedAt?: string;
}

export interface TeacherCourseStat {
  subject_id: string;
  subject_name: string;
  group_id: string;
  group_name: string;
  level: string;
  theory: number;
  practice: number;
  credit: number;
  periods: number;
  isJoint: boolean;
}

export interface TeacherSummaryItem {
  id: string;
  name: string;
  role: string;
  department: string;
  specialRole: string;
  theory: number;
  practice: number;
  credit: number;
  pvcPeriods: number;
  pvsPeriods: number;
  totalPeriods: number;
  minLoad: number;
  maxLoad: number;
  inRange: boolean;
  subjects: TeacherCourseStat[];
}

export interface StatsResponse {
  days: string[];
  periods: number[];
  homeroomPeriod: number;
  breakPeriod: number;
  maxPerDay: number;
  groups: number;
  usablePerWeek: number;
  teacherLoad: { id: string; name: string; role: string; periods: number; perDay: number[] }[];
  teacherSummary: TeacherSummaryItem[];
  roomUsage: { id: string; name: string; type: string; periods: number; pct: number }[];
  heat: (number | null)[][];
  groupDaily: { id: string; name: string; total: number; perDay: number[] }[];
}

export interface ChatAction {
  kind: string;
  payload?: unknown;
  label?: string;
  danger?: boolean;
  auto?: boolean;
}

export interface ChatCard {
  type: 'table' | 'list' | 'action' | 'buttons';
  title?: string;
  columns?: string[];
  rows?: (string | number)[][];
  link?: { label: string; path: string };
  items?: (string | { label: string; action: ChatAction })[];
  ask?: boolean;
  lines?: string[];
  status?: 'pending' | 'running' | 'done' | 'error';
  resultText?: string;
  action?: ChatAction;
}

export interface ChatReply {
  intent: string;
  text: string;
  cards: ChatCard[];
  suggestions: string[];
  context: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  from: 'user' | 'bot';
  text: string;
  cards?: ChatCard[];
  suggestions?: string[];
  time: string;
}
