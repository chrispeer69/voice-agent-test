import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const directory = mkdtempSync(join(tmpdir(), 'batch-schedule-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const source = readFileSync(new URL('../src/lib/batch-schedule.ts', import.meta.url), 'utf8');
writeFileSync(join(directory, 'schedule.mjs'), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { planBatchTimes, isoToZonedInput, zonedToIso } = await import(pathToFileURL(join(directory, 'schedule.mjs')));

test('spreads requested posts within the New York local window', () => {
  const dates = planBatchTimes({ count: 5, startDate: '2027-03-15', days: 5, windowStart: '09:00', windowEnd: '18:00', timezone: 'America/New_York' });
  assert.equal(dates.length, 5);
  const format = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const local = dates.map(value => Object.fromEntries(format.formatToParts(new Date(value)).map(part => [part.type, part.value])));
  assert.deepEqual(local.map(value => Number(value.day)), [15, 16, 17, 18, 19]);
  assert.ok(local.every(value => Number(value.hour) >= 9 && Number(value.hour) < 18));
});

test('rejects reversed windows and past schedules', () => {
  const base = { count: 3, startDate: '2027-03-15', days: 2, windowStart: '09:00', windowEnd: '18:00', timezone: 'America/New_York' };
  assert.throws(() => planBatchTimes({ ...base, windowStart: '18:00', windowEnd: '09:00' }), /window must end/);
  assert.throws(() => planBatchTimes({ ...base, count: 20, days: 1, windowStart: '09:00', windowEnd: '09:01' }), /longer posting window/);
  assert.throws(() => planBatchTimes({ ...base, startDate: '2020-01-01' }), /future starting date/);
});

test('schedule editor round-trips New York local time', () => {
  const iso = zonedToIso('2027-03-15T14:30', 'America/New_York');
  assert.equal(isoToZonedInput(iso, 'America/New_York'), '2027-03-15T14:30');
});
