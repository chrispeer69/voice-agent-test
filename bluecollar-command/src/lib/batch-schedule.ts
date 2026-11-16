/** Evenly spread posts through the selected local-day windows. */
export function planBatchTimes(input: {
  count: number;
  startDate: string;
  days: number;
  windowStart: string;
  windowEnd: string;
  timezone: string;
}): string[] {
  const { count, startDate, days, windowStart, windowEnd, timezone } = input;
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Choose 1–20 posts.');
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('Choose 1–90 days.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(`${startDate}T12:00:00Z`))) throw new Error('Choose a valid start date.');
  const parseTime = (value: string): number => {
    if (!/^\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid posting window.');
    const [hour, minute] = value.split(':').map(Number);
    if (hour! > 23 || minute! > 59) throw new Error('Choose a valid posting window.');
    return hour! * 60 + minute!;
  };
  const firstMinute = parseTime(windowStart);
  const lastMinute = parseTime(windowEnd);
  if (firstMinute >= lastMinute) throw new Error('The posting window must end after it starts.');
  const windowMinutes = lastMinute - firstMinute;
  const totalSlots = days * windowMinutes;
  if (totalSlots < count) throw new Error('Choose a longer posting window or fewer posts.');
  const dates: string[] = [];
  for (let index = 0; index < count; index++) {
    const slot = count === 1 ? Math.floor((totalSlots - 1) / 2) : Math.floor(index * (totalSlots - 1) / (count - 1));
    const dayOffset = Math.floor(slot / windowMinutes);
    const minuteOfDay = firstMinute + slot % windowMinutes;
    const day = new Date(`${startDate}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + dayOffset);
    const localDate = day.toISOString().slice(0, 10);
    const localTime = `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
    dates.push(zonedToIso(`${localDate}T${localTime}`, timezone));
  }
  if (Date.parse(dates[0]!) <= Date.now()) throw new Error('Choose a future starting date or later posting hours.');
  return dates;
}

export function zonedToIso(value: string, zone: string): string {
  const input = new Date(`${value}:00Z`);
  const format = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(format.formatToParts(input).map(part => [part.type, part.value]));
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  const output = new Date(input.getTime() + (input.getTime() - shown));
  const check = Object.fromEntries(format.formatToParts(output).map(part => [part.type, part.value]));
  if (`${check.year}-${check.month}-${check.day}T${check.hour}:${check.minute}` !== value) throw new Error(`The selected time ${value} does not exist in ${zone}.`);
  return output.toISOString();
}

export function isoToZonedInput(value: string, zone: string): string {
  const format = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(format.formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
