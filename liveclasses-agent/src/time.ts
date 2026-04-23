const MOSCOW_OFFSET_HOURS = 3;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function getMoscowDateParts(base: Date): DateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(base);
  const year = Number(parts.find(p => p.type === 'year')?.value);
  const month = Number(parts.find(p => p.type === 'month')?.value);
  const day = Number(parts.find(p => p.type === 'day')?.value);

  if (!year || !month || !day) {
    throw new Error('Failed to derive Moscow date parts');
  }

  return { year, month, day };
}

function addDays(parts: DateParts, days: number): DateParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function toUtcIsoFromMoscow(parts: DateParts, hours: number, minutes: number): string {
  const utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hours - MOSCOW_OFFSET_HOURS,
    minutes,
    0,
    0
  );
  return new Date(utcMs).toISOString();
}

export function getTomorrowMoscowRangeUtc(base: Date = new Date()): {
  startUtcIso: string;
  endUtcIso: string;
} {
  const todayMoscow = getMoscowDateParts(base);
  const tomorrowMoscow = addDays(todayMoscow, 1);
  const dayAfterTomorrowMoscow = addDays(todayMoscow, 2);

  return {
    startUtcIso: toUtcIsoFromMoscow(tomorrowMoscow, 0, 0),
    endUtcIso: toUtcIsoFromMoscow(dayAfterTomorrowMoscow, 0, 0),
  };
}

export function buildTomorrowBroadcastUtcIso(
  startTime: string,
  base: Date = new Date()
): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    throw new Error(`Invalid start_time format: "${startTime}"`);
  }

  const todayMoscow = getMoscowDateParts(base);
  const tomorrowMoscow = addDays(todayMoscow, 1);
  return toUtcIsoFromMoscow(tomorrowMoscow, hours, minutes);
}
