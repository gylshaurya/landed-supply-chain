// Calendar-day helpers. All dates are 'YYYY-MM-DD' strings handled in UTC so
// that day arithmetic never drifts across timezones or DST.

const DAY = 86_400_000;

export function toDay(date: string): number {
  return Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY);
}

export function fromDay(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDay(toDay(date) + days);
}

export function diffDays(a: string, b: string): number {
  return toDay(a) - toDay(b);
}

export function maxDate(...dates: (string | undefined)[]): string {
  return dates.filter(Boolean).sort().at(-1)!;
}

export function minDate(...dates: (string | undefined)[]): string {
  return dates.filter(Boolean).sort()[0]!;
}

export function fmt(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function fmtLong(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
