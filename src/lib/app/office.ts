// Expenses, time-space percentage and document expiry helpers.
import type { Attendance, DocumentRow, Expense, TimeSpace } from "./types";
import { localDate } from "./time";

/** Expense categories. "home" ones are whole-home costs that get the time-space percentage. */
export const CATEGORIES: { name: string; home: boolean }[] = [
  { name: "Food and snacks", home: false },
  { name: "Toys and activities", home: false },
  { name: "Supplies (diapers, wipes, cleaning)", home: false },
  { name: "Furniture and equipment", home: false },
  { name: "Office, phone and software", home: false },
  { name: "Training, license and fees", home: false },
  { name: "Insurance (daycare liability)", home: false },
  { name: "Advertising", home: false },
  { name: "Car and field trips", home: false },
  { name: "Rent or mortgage interest", home: true },
  { name: "Utilities (power, gas, water, internet)", home: true },
  { name: "Home insurance", home: true },
  { name: "Property tax", home: true },
  { name: "Home repairs and maintenance", home: true },
  { name: "Other", home: false },
];

export const DOC_KINDS = [
  "Immunization record",
  "Physical / health form",
  "Enrollment form",
  "Allergy or medical plan",
  "Daycare license",
  "CPR / First aid",
  "Liability insurance",
  "Fire or safety inspection",
  "Background check",
  "Training certificate",
  "Other",
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Hours the home was used for care: earliest sign-in to latest sign-out each day, plus extra prep hours. */
export function careHours(rows: Attendance[], extra: number) {
  const days = new Map<string, { start: number; end: number }>();
  for (const r of rows) {
    if (!r.check_in || !r.check_out) continue;
    const s = new Date(r.check_in).getTime();
    const e = new Date(r.check_out).getTime();
    const d = days.get(r.care_date);
    days.set(r.care_date, d ? { start: Math.min(d.start, s), end: Math.max(d.end, e) } : { start: s, end: e });
  }
  let ms = 0;
  days.forEach((d) => (ms += Math.max(0, d.end - d.start)));
  return { days: days.size, hours: round2(ms / 3600000 + (Number(extra) || 0)) };
}

export function hoursInYear(year: number) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return (leap ? 366 : 365) * 24;
}

/** IRS-style time-space percentage: (care hours / hours in year) x (daycare area / home area). */
export function timeSpace(year: number, hours: number, ts: TimeSpace | null) {
  const timePct = Math.min(1, hours / hoursInYear(year));
  const spacePct = ts && Number(ts.total_sqft) > 0 ? Math.min(1, Number(ts.daycare_sqft) / Number(ts.total_sqft)) : 0;
  return { timePct, spacePct, pct: timePct * spacePct };
}

export function expenseSummary(expenses: Expense[], tsPct: number) {
  const byCat = new Map<string, { spent: number; deductible: number; home: boolean }>();
  for (const e of expenses) {
    const base = (Number(e.amount) * Number(e.business_pct)) / 100;
    const deductible = e.home_expense ? base * tsPct : base;
    const c = byCat.get(e.category) ?? { spent: 0, deductible: 0, home: e.home_expense };
    c.spent += Number(e.amount);
    c.deductible += deductible;
    byCat.set(e.category, c);
  }
  const rows = [...byCat.entries()].map(([category, v]) => ({ category, spent: round2(v.spent), deductible: round2(v.deductible), home: v.home }));
  rows.sort((a, b) => b.deductible - a.deductible);
  return { rows, total: round2(rows.reduce((s, r) => s + r.deductible, 0)) };
}

export type DocStatus = "expired" | "soon" | "ok" | "none";

export function docStatus(d: DocumentRow, today = localDate()): DocStatus {
  if (!d.expires_on) return "none";
  if (d.expires_on < today) return "expired";
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  return d.expires_on <= localDate(soon) ? "soon" : "ok";
}

export function csv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function downloadText(text: string, name: string, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
