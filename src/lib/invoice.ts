import { ProviderInfo, emptyProvider, slug } from "@/lib/provider";
import { INK, LINE, PEACH, PEACH_SOFT, SOFT, brandFooter, formatMoney, lines, newDoc, parseAmount, prettyDate, put, todayIso } from "@/lib/pdfKit";

export type InvoiceLine = { description: string; qty: string; rate: string };

export type InvoiceData = ProviderInfo & {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  parentName: string;
  parentContact: string;
  children: string;
  items: InvoiceLine[];
  paid: string;
  paymentInfo: string;
  notes: string;
};

export function emptyInvoice(): InvoiceData {
  return {
    ...emptyProvider(),
    invoiceNumber: "",
    date: todayIso(),
    dueDate: "",
    parentName: "",
    parentContact: "",
    children: "",
    items: [{ description: "Weekly child care", qty: "1", rate: "" }],
    paid: "",
    paymentInfo: "",
    notes: "",
  };
}

export const lineTotal = (l: InvoiceLine) => Math.round(parseAmount(l.qty || "1") * parseAmount(l.rate) * 100) / 100;
export const invoiceSubtotal = (d: InvoiceData) => Math.round(d.items.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;
export const invoiceBalance = (d: InvoiceData) => Math.round((invoiceSubtotal(d) - parseAmount(d.paid)) * 100) / 100;

export function validateInvoice(d: InvoiceData): string[] {
  const e: string[] = [];
  if (!d.providerName.trim()) e.push("Add your name (the provider).");
  if (!d.parentName.trim()) e.push("Add the family you're billing.");
  if (invoiceSubtotal(d) <= 0) e.push("Add at least one charge with an amount.");
  return e;
}

export const invoiceFileName = (d: InvoiceData) => `invoice-${d.date}-${slug(d.parentName)}.pdf`;

export async function buildInvoicePdf(d: InvoiceData): Promise<Blob> {
  const doc = await newDoc();
  const W = doc.internal.pageSize.getWidth();
  const M = 54;
  let y = M + 10;
  put(doc, "Invoice", M, y, 24, "bold");
  const meta = [
    d.invoiceNumber.trim() ? `Invoice #${d.invoiceNumber.trim()}` : "",
    `Date: ${prettyDate(d.date)}`,
    d.dueDate ? `Due: ${prettyDate(d.dueDate)}` : "",
  ].filter(Boolean);
  let my = y - 8;
  for (const m of meta) {
    put(doc, m, W - M, my, 10.5, "normal", SOFT, "right");
    my += 14;
  }
  y = Math.max(y + 34, my + 14);

  const colW = (W - M * 2 - 24) / 2;
  put(doc, "FROM", M, y, 9, "bold", PEACH);
  put(doc, "BILL TO", M + colW + 24, y, 9, "bold", PEACH);
  y += 16;
  const y1 = lines(doc, [d.businessName, d.providerName, d.providerAddress, d.providerContact], M, y, colW);
  const y2 = lines(doc, [d.parentName, d.parentContact, d.children ? `Child(ren): ${d.children}` : ""], M + colW + 24, y, colW);
  y = Math.max(y1, y2) + 18;

  // Table header
  const xQty = W - M - 200;
  const xRate = W - M - 110;
  const xAmt = W - M;
  doc.setFillColor(...PEACH_SOFT);
  doc.rect(M, y, W - M * 2, 24, "F");
  put(doc, "Description", M + 10, y + 16, 10, "bold");
  put(doc, "Qty", xQty, y + 16, 10, "bold", INK, "right");
  put(doc, "Rate", xRate, y + 16, 10, "bold", INK, "right");
  put(doc, "Amount", xAmt - 10, y + 16, 10, "bold", INK, "right");
  y += 40;
  for (const l of d.items) {
    if (!l.description.trim() && !parseAmount(l.rate)) continue;
    const ls = doc.splitTextToSize(l.description || "Child care", xQty - M - 60) as string[];
    put(doc, ls, M + 10, y, 11);
    put(doc, l.qty || "1", xQty, y, 11, "normal", INK, "right");
    put(doc, formatMoney(parseAmount(l.rate), d.currency), xRate, y, 11, "normal", INK, "right");
    put(doc, formatMoney(lineTotal(l), d.currency), xAmt - 10, y, 11, "normal", INK, "right");
    y += ls.length * 15 + 8;
    doc.setDrawColor(...LINE);
    doc.line(M, y - 10, W - M, y - 10);
  }
  y += 8;
  const paid = parseAmount(d.paid);
  const totals: [string, string, boolean][] = [["Subtotal", formatMoney(invoiceSubtotal(d), d.currency), false]];
  if (paid > 0) totals.push(["Already paid", `-${formatMoney(paid, d.currency)}`, false]);
  totals.push(["Amount due", formatMoney(invoiceBalance(d), d.currency), true]);
  for (const [k, v, bold] of totals) {
    put(doc, k, xRate, y, bold ? 13 : 11, bold ? "bold" : "normal", INK, "right");
    put(doc, v, xAmt - 10, y, bold ? 13 : 11, bold ? "bold" : "normal", INK, "right");
    y += bold ? 22 : 17;
  }
  y += 16;
  if (d.paymentInfo.trim()) {
    put(doc, "HOW TO PAY", M, y, 9, "bold", PEACH);
    y = lines(doc, [d.paymentInfo.trim()], M, y + 16, W - M * 2) + 8;
  }
  if (d.notes.trim()) {
    put(doc, "NOTES", M, y, 9, "bold", PEACH);
    y = lines(doc, [d.notes.trim()], M, y + 16, W - M * 2, 10.5, SOFT);
  }
  brandFooter(doc, M);
  return doc.output("blob");
}
