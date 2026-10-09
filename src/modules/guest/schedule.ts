/** Menu time windows: [{days:[1..7] (1=Mon … 7=Sun, 0 also = Sun), from:"11:30", to:"14:30"}]. */
export type MenuWindow = { days: number[]; from: string; to: string };

/** Weekday (1=Mon … 7=Sun) and minutes since midnight in the restaurant's timezone. */
export function zonedNow(timezone: string, now = new Date()): { day: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { day: day || 1, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const hasDay = (days: number[], d: number) => days.includes(d) || (d === 7 && days.includes(0));

export function isWindowActive(w: MenuWindow, at: { day: number; minutes: number }) {
  const from = toMin(w.from);
  const to = toMin(w.to);
  const days = w.days?.length ? w.days : [1, 2, 3, 4, 5, 6, 7];
  if (from <= to) return hasDay(days, at.day) && at.minutes >= from && at.minutes < to;
  // overnight window, e.g. 22:00–02:00
  const prev = at.day === 1 ? 7 : at.day - 1;
  return (hasDay(days, at.day) && at.minutes >= from) || (hasDay(days, prev) && at.minutes < to);
}

export function isScheduleActive(schedule: MenuWindow[] | null | undefined, timezone: string, now = new Date()) {
  if (!schedule?.length) return true;
  const at = zonedNow(timezone, now);
  return schedule.some((w) => isWindowActive(w, at));
}
