export const FREE_VISIT_DAYS = 3;
export const MEDICINE_EXPIRY_MONTHS = 2;

export function computeFreeVisitDeadline(generatedAt: Date): Date {
  const d = new Date(generatedAt);
  d.setUTCDate(d.getUTCDate() + FREE_VISIT_DAYS);
  return d;
}

export function computeMedicineExpiry(generatedAt: Date): Date {
  return addMonthsClamped(generatedAt, MEDICINE_EXPIRY_MONTHS);
}

function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
