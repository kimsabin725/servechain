import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDays, chainDeadline, deadlineView, nyCalendarDate, responseDeadlineDate } from '../scripts/lib/deadline.mjs';

test('fall DST: 2026-10-25 00:30 EDT + 30 calendar days is 2026-11-24, while +720 h lands on 2026-11-23 in New York', () => {
  const filed = '2026-10-25T04:30:00Z';
  assert.equal(nyCalendarDate(filed), '2026-10-25');
  assert.equal(responseDeadlineDate(filed), '2026-11-24');
  const v = deadlineView(filed);
  assert.equal(v.chain, '2026-11-24T04:30:00.000Z');
  assert.equal(v.chainNY, '2026-11-23');
  assert.equal(v.differs, true);
});

test('spring DST: 2027-02-12 23:30 EST + 30 calendar days is 2027-03-14, while +720 h lands on 2027-03-15 in New York', () => {
  const filed = '2027-02-13T04:30:00Z';
  assert.equal(nyCalendarDate(filed), '2027-02-12');
  assert.equal(responseDeadlineDate(filed), '2027-03-14');
  const v = deadlineView(filed);
  assert.equal(v.chainNY, '2027-03-15');
  assert.equal(v.differs, true);
});

test('no DST change: calendar and on-chain dates agree; unix seconds and plain dates are accepted', () => {
  const filed = Math.floor(Date.parse('2026-10-25T08:46:36Z') / 1000);
  const v = deadlineView(filed, filed + 720 * 3600);
  assert.equal(v.calendar, '2026-11-24');
  assert.equal(v.chainNY, '2026-11-24');
  assert.equal(v.differs, false);
  assert.equal(chainDeadline('2026-10-25T08:46:36Z'), '2026-11-24T08:46:36.000Z');
  assert.equal(addCalendarDays('2028-02-15', 30), '2028-03-16');
  assert.equal(nyCalendarDate('2026-01-31'), '2026-01-31');
  assert.equal(nyCalendarDate(null), null);
});
