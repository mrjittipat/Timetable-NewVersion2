export const ENTITIES = {
  teacher: {
    file: 'teacher.csv',
    aliases: ['teacher', 'teachers'],
    fields: ['teacher_id', 'teacher_name', 'role', 'department', 'special_role'],
    key: ['teacher_id'],
    int: [],
  },
  room: {
    file: 'room.csv',
    aliases: ['room', 'rooms'],
    fields: ['room_id', 'room_name', 'room_type'],
    key: ['room_id'],
    int: [],
  },
  student_group: {
    file: 'student_group.csv',
    aliases: ['student_group', 'student_groups', 'group', 'groups'],
    fields: ['group_id', 'group_name', 'student_count', 'advisor', 'department', 'level', 'year'],
    key: ['group_id'],
    int: ['student_count', 'year'],
  },
  subject: {
    file: 'subject.csv',
    aliases: ['subject', 'subjects'],
    fields: ['subject_id', 'subject_name', 'theory', 'practice', 'credit', 'hours'],
    key: ['subject_id'],
    int: ['theory', 'practice', 'credit', 'hours'],
  },
  teach: {
    file: 'teach.csv',
    aliases: ['teach', 'teaches'],
    fields: ['teacher_id', 'subject_id'],
    key: ['teacher_id', 'subject_id'],
    int: [],
  },
  timeslot: {
    file: 'timeslot.csv',
    aliases: ['timeslot', 'timeslots'],
    fields: ['timeslot_id', 'day', 'period', 'start', 'end'],
    key: ['timeslot_id'],
    int: ['period'],
  },
  register: {
    file: 'register.csv',
    aliases: ['register', 'registers', 'registration'],
    fields: ['group_id', 'subject_id'],
    key: ['group_id', 'subject_id'],
    int: [],
  },
};

export const OUTPUT_FIELDS = ['group_id', 'timeslot_id', 'subject_id', 'teacher_id', 'room_id'];

export function entityFromFilename(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/\.(csv|xlsx|xls)$/i, '')
    .trim();
  for (const [entity, def] of Object.entries(ENTITIES)) {
    if (def.aliases.includes(base)) return entity;
  }
  return null;
}

export function rowKey(entity, row) {
  const def = ENTITIES[entity];
  if (!def) return '';
  return def.key.map((k) => String(row?.[k] ?? '').trim()).join('|');
}

export function normalizeRow(entity, raw) {
  const def = ENTITIES[entity];
  if (!def) return {};
  const intSet = new Set(def.int);
  const out = {};
  for (const field of def.fields) {
    const val = raw?.[field];
    if (intSet.has(field)) {
      const n = Number(val);
      out[field] = Number.isFinite(n) ? Math.round(n) : 0;
    } else {
      out[field] = val === undefined || val === null ? '' : String(val).trim();
    }
  }
  return out;
}
