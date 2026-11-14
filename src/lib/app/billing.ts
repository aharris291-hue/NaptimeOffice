// Turns rates, attendance and late fees into invoice drafts, and invoices into PDFs.
import type { Attendance, Child, Contact, Family, Invoice, InvoiceItem, Payment, Provider } from "./types";
import { DAYS } from "./types";
import { localDate } from "./time";
import { buildInvoicePdf, type InvoiceData } from "@/lib/invoice";
import { buildReceiptPdf, type ReceiptData } from "@/lib/receipt";
import { slug } from "@/lib/provider";

export type Draft = {
  key: string;
  family: Family;
  contact_id: string | null;
  bill_to: string;
  share: number;
  items: InvoiceItem[];
  include: boolean;
  /** Attendance rows whose late fees are on this draft. */
  feeRows: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function parse(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function eachDay(start: string, end: string): Date[] {
  const out: Date[] = [];
  for (let d = parse(start); d <= parse(end); d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
}

export const itemsTotal = (items: InvoiceItem[]) => round2(items.reduce((s, i) => s + round2((Number(i.qty) || 0) * (Number(i.rate) || 0)), 0));
export const shareTotal = (items: InvoiceItem[], share: number) => round2((itemsTotal(items) * share) / 100);

/** Care charges for one child over a billing period. */
export function childItems(child: Child, period: { start: string; end: string }, rows: Attendance[], unbilledFees: Attendance[], today = localDate()): InvoiceItem[] {
  const days = eachDay(period.start, period.end);
  const name = child.first_name;
  const mine = rows.filter((r) => r.child_id === child.id);
  const past = period.end < today;
  const items: InvoiceItem[] = [];
  const rate = Number(child.rate) || 0;

  if (rate > 0) {
    if (child.rate_type === "weekly") {
      const mondays = days.filter((d) => d.getDay() === 1).length;
      items.push({ description: `Weekly care: ${name}`, qty: mondays || round2(days.length / 7), rate });
    } else if (child.rate_type === "monthly") {
      const firsts = days.filter((d) => d.getDate() === 1).length;
      items.push({ description: `Monthly care: ${name}`, qty: firsts || round2(days.length / 30.4), rate });
    } else if (child.rate_type === "daily") {
      const qty = past
        ? new Set(mine.filter((r) => r.check_in).map((r) => r.care_date)).size
        : days.filter((d) => child.schedule_days.includes(DAYS[d.getDay()])).length;
      items.push({ description: `${past ? "Days attended" : "Scheduled days"}: ${name}`, qty, rate });
    } else {
      const hours = mine.reduce((s, r) => (r.check_in && r.check_out ? s + (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000 : s), 0);
      items.push({ description: `Hours of care: ${name}`, qty: Math.round(hours * 4) / 4, rate });
    }
  }
  const late = unbilledFees.filter((r) => r.child_id === child.id);
  if (late.length) {
    items.push({ description: `Late pick-up fees: ${name} (${late.length})`, qty: 1, rate: round2(late.reduce((s, r) => s + Number(r.late_fee), 0)) });
  }
  return items.filter((i) => i.qty > 0);
}

/** One draft per paying adult (split billing), or one per family if nobody has a share set. */
export function familyDrafts(family: Family, children: Child[], contacts: Contact[], rows: Attendance[], unbilledFees: Attendance[], period: { start: string; end: string }): Draft[] {
  const kids = children.filter((c) => c.family_id === family.id && c.active);
  const items = kids.flatMap((c) => childItems(c, period, rows, unbilledFees));
  const ids = new Set(kids.map((k) => k.id));
  const feeRows = unbilledFees.filter((r) => ids.has(r.child_id)).map((r) => r.id);
  const people = contacts.filter((c) => c.family_id === family.id);
  const payers = people.filter((c) => Number(c.billing_share) > 0);
  if (payers.length === 0) {
    const guardian = people.find((p) => p.is_guardian) ?? people[0];
    return [{ key: family.id, family, contact_id: guardian?.id ?? null, bill_to: guardian?.full_name ?? family.name, share: 100, items, include: items.length > 0, feeRows }];
  }
  return payers.map((p) => ({
    key: `${family.id}:${p.id}`,
    family,
    contact_id: p.id,
    bill_to: p.full_name,
    share: Number(p.billing_share),
    items: items.map((i) => ({ ...i })),
    include: items.length > 0,
    feeRows,
  }));
}

export function paidOn(inv: Invoice, payments: Payment[]) {
  return round2(payments.filter((p) => p.invoice_id === inv.id).reduce((s, p) => s + Number(p.amount), 0));
}

export function familyBalance(familyId: string, invoices: Invoice[], payments: Payment[]) {
  const billed = invoices.filter((i) => i.family_id === familyId && i.status === "open").reduce((s, i) => s + Number(i.total), 0);
  const paid = payments.filter((p) => p.family_id === familyId).reduce((s, p) => s + Number(p.amount), 0);
  return round2(billed - paid);
}

function providerInfo(p: Provider) {
  return {
    providerName: p.provider_name,
    businessName: p.business_name,
    providerAddress: p.address,
    providerContact: [p.phone, p.email].filter(Boolean).join(" · "),
    currency: p.currency,
  };
}

export async function invoicePdf(inv: Invoice, provider: Provider, family: Family, kids: Child[], contact: Contact | undefined, paid: number) {
  const scale = Number(inv.share) / 100;
  const data: InvoiceData = {
    ...providerInfo(provider),
    invoiceNumber: inv.number,
    date: inv.issue_date,
    dueDate: inv.due_date ?? "",
    parentName: inv.bill_to || family.name,
    parentContact: contact ? [contact.phone, contact.email].filter(Boolean).join(" · ") : "",
    children: kids.map((k) => k.first_name).join(", "),
    items: inv.items.map((i) => ({
      description: scale < 1 ? `${i.description} (your ${inv.share}% share)` : i.description,
      qty: String(i.qty),
      rate: String(round2(Number(i.rate) * scale)),
    })),
    paid: paid ? String(paid) : "",
    paymentInfo: provider.payment_info,
    notes: [`Care period: ${inv.period_start} to ${inv.period_end}.`, inv.notes].filter(Boolean).join(" "),
  };
  return { blob: await buildInvoicePdf(data), name: `invoice-${inv.number}-${slug(inv.bill_to || family.name)}.pdf` };
}

export async function receiptPdf(pay: Payment, provider: Provider, family: Family, kids: Child[], inv?: Invoice) {
  const data: ReceiptData = {
    ...providerInfo(provider),
    receiptNumber: pay.id.slice(0, 8).toUpperCase(),
    date: pay.paid_on,
    parentName: pay.paid_by || family.name,
    children: kids.map((k) => k.first_name).join(", "),
    amount: String(pay.amount),
    method: pay.method,
    reference: pay.reference,
    forPeriod: inv ? `Invoice #${inv.number} (${inv.period_start} to ${inv.period_end})` : "",
    notes: "",
  };
  return { blob: await buildReceiptPdf(data), name: `receipt-${pay.paid_on}-${slug(pay.paid_by || family.name)}.pdf` };
}

/** Opens the phone's share sheet with the PDF (text, email, AirDrop), or downloads it on a computer. */
export async function shareOrDownload(blob: Blob, name: string, text: string) {
  const file = new File([blob], name, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name, text });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Billing period presets. Many home daycares bill weekly in advance. */
export function periodPresets(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const week = (offset: number) => {
    const s = new Date(monday);
    s.setDate(s.getDate() + offset * 7);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return { start: localDate(s), end: localDate(e) };
  };
  const month = (offset: number) => ({
    start: localDate(new Date(d.getFullYear(), d.getMonth() + offset, 1)),
    end: localDate(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0)),
  });
  return [
    { label: "Next week", ...week(1) },
    { label: "This week", ...week(0) },
    { label: "Last week", ...week(-1) },
    { label: "Next month", ...month(1) },
    { label: "This month", ...month(0) },
    { label: "Last month", ...month(-1) },
  ];
}
