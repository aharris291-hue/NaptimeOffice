// Small date helpers. Care dates use the provider's device local date.
import type { Provider, RatioRule, Child } from "./types";

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function clock(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ageInMonths(birth: string | null, on = new Date()): number | null {
  if (!birth) return null;
  const [y, m, d] = birth.split("-").map(Number);
  let months = (on.getFullYear() - y) * 12 + (on.getMonth() - (m - 1));
  if (on.getDate() < d) months -= 1;
  return Math.max(0, months);
}

export function ageLabel(birth: string | null): string {
  const m = ageInMonths(birth);
  if (m === null) return "";
  if (m < 24) return `${m} mo`;
  return `${Math.floor(m / 12)} yr`;
}

/** Minutes after (closing time + grace). 0 if on time. */
export function lateMinutes(checkOut: Date, p: Pick<Provider, "close_time" | "late_grace_minutes">): number {
  const [h, mi] = p.close_time.split(":").map(Number);
  const close = new Date(checkOut);
  close.setHours(h, mi, 0, 0);
  const diff = Math.floor((checkOut.getTime() - close.getTime()) / 60000);
  return diff > p.late_grace_minutes ? diff : 0;
}

/** Fee charged per started block of minutes, e.g. $5 per 15 minutes. */
export function lateFee(minutes: number, p: Pick<Provider, "late_fee_amount" | "late_fee_per_minutes">): number {
  if (minutes <= 0 || !p.late_fee_amount) return 0;
  const blocks = Math.ceil(minutes / Math.max(1, p.late_fee_per_minutes));
  return Math.round(blocks * p.late_fee_amount * 100) / 100;
}

export type RatioCheck = { ok: boolean; messages: string[] };

/** Checks the children currently present against the provider's own ratio rules. */
export function checkRatios(present: Child[], adults: number, rules: RatioRule[], maxChildren: number): RatioCheck {
  const messages: string[] = [];
  if (present.length > maxChildren) messages.push(`${present.length} children present, over your capacity of ${maxChildren}.`);
  for (const r of rules) {
    const count = present.filter((c) => {
      const a = ageInMonths(c.birth_date);
      return a !== null && a < r.max_age_months;
    }).length;
    const allowed = r.max_per_adult * Math.max(1, adults);
    if (count > allowed) messages.push(`${count} children ${r.label.toLowerCase()}, but ${adults} adult${adults === 1 ? "" : "s"} allows ${allowed}.`);
  }
  return { ok: messages.length === 0, messages };
}
