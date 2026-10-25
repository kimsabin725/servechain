export const RESPONSE_DAYS = 30;
export const CHAIN_PERIOD_HOURS = 720;
export const CALENDAR_RULE = 'New York date of the declared filing + 30 calendar days';
export const CHAIN_LABEL = 'on-chain timestamp (filedAt + 720 h)';
export const CHAIN_NOTE = 'The on-chain value is filedAt + 720 hours. Across a daylight-saving change it can fall on a different New York date than the calendar deadline, by one day.';
export const GATE_NOTE = 'The registry allows the activity snapshot once block time passes filedAt + 720 h, which is earlier than the end of the last calendar day. Counsel should treat the end of that New York day as the deadline.';

const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

// Converts an ISO string, Date or unix seconds to a Date, or null.
function toDate(t) {
  if (t == null || t === '') return null;
  const d = typeof t === 'number' || typeof t === 'bigint' ? new Date(Number(t) * 1000) : new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

// New York calendar date (YYYY-MM-DD) of a time; plain dates pass through.
export function nyCalendarDate(t) {
  if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = toDate(t);
  return d ? NY.format(d) : null;
}

// Adds whole calendar days to a YYYY-MM-DD date.
export function addCalendarDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Response deadline as a New York calendar date: filing date + 30 days.
export function responseDeadlineDate(filedAt, days = RESPONSE_DAYS) {
  const start = nyCalendarDate(filedAt);
  return start ? addCalendarDays(start, days) : null;
}

// On-chain response deadline: filedAt + 720 hours, as ISO.
export function chainDeadline(filedAt) {
  const d = toDate(filedAt);
  return d ? new Date(d.getTime() + CHAIN_PERIOD_HOURS * 3_600_000).toISOString() : null;
}

// Calendar deadline, the on-chain timestamp and whether they fall on different New York dates.
export function deadlineView(filedAt, onChain = chainDeadline(filedAt)) {
  const calendar = responseDeadlineDate(filedAt);
  const chain = toDate(onChain)?.toISOString() ?? null;
  const chainNY = nyCalendarDate(chain);
  return { calendar, chain, chainNY, differs: !!calendar && !!chainNY && calendar !== chainNY, rule: CALENDAR_RULE, chainLabel: CHAIN_LABEL, chainNote: CHAIN_NOTE };
}
