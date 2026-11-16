/** Convert a wall-clock time in the GHL subaccount zone to an absolute ISO time. */
export function zonedToIso(value: string, zone: string): string {
  if (!value) throw new Error('Choose a date and time.');
  const input = new Date(`${value}:00Z`);
  if (Number.isNaN(input.getTime())) throw new Error('Invalid date and time.');
  const shown = zoneParts(input, zone);
  const shownUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
  const output = new Date(input.getTime() + (input.getTime() - shownUtc));
  if (localInputInZone(output, zone) !== value.slice(0, 16)) {
    throw new Error('This local time does not exist in the subaccount timezone. Choose another time.');
  }
  return output.toISOString();
}

function zoneParts(date: Date, zone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) };
}

export function localInputInZone(date: Date, zone: string): string {
  const p = zoneParts(date, zone);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}`;
}

export function dateKeyInZone(date: Date, zone: string): string {
  return localInputInZone(date, zone).slice(0, 10);
}

export function formatInZone(date: Date, zone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, ...options }).format(date);
}
