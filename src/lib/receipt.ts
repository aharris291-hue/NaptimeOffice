import { ProviderInfo, emptyProvider, slug } from "@/lib/provider";
import { INK, LINE, PEACH, PEACH_SOFT, SOFT, brandFooter, formatMoney, lines, newDoc, parseAmount, prettyDate, put, todayIso } from "@/lib/pdfKit";

export const METHODS = ["Cash", "Check", "Venmo", "Zelle", "PayPal", "Bank transfer", "Card", "Other"];

export type ReceiptData = ProviderInfo & {
  receiptNumber: string;
  date: string;
  parentName: string;
  children: string;
  amount: string;
  method: string;
  reference: string;
  forPeriod: string;
  notes: string;
};

export function emptyReceipt(): ReceiptData {
  return {
    ...emptyProvider(),
    receiptNumber: "",
    date: todayIso(),
    parentName: "",
    children: "",
    amount: "",
    method: "Cash",
    reference: "",
    forPeriod: "",
    notes: "",
  };
}

export function validateReceipt(d: ReceiptData): string[] {
  const e: string[] = [];
  if (!d.providerName.trim()) e.push("Add your name (the provider).");
  if (!d.parentName.trim()) e.push("Add who paid.");
  if (parseAmount(d.amount) <= 0) e.push("Add the amount received.");
  if (!d.date) e.push("Add the payment date.");
  return e;
}

export const receiptFileName = (d: ReceiptData) => `receipt-${d.date}-${slug(d.parentName)}.pdf`;

export async function buildReceiptPdf(d: ReceiptData): Promise<Blob> {
  const doc = await newDoc();
  const W = doc.internal.pageSize.getWidth();
  const M = 54;
  let y = M + 10;
  put(doc, "Payment Receipt", M, y, 22, "bold");
  if (d.receiptNumber.trim()) put(doc, `Receipt #${d.receiptNumber.trim()}`, W - M, y, 11, "normal", SOFT, "right");
  y += 20;
  put(doc, prettyDate(d.date), M, y, 11, "normal", SOFT);
  y += 34;

  const colW = (W - M * 2 - 24) / 2;
  put(doc, "RECEIVED BY", M, y, 9, "bold", PEACH);
  put(doc, "RECEIVED FROM", M + colW + 24, y, 9, "bold", PEACH);
  y += 16;
  const y1 = lines(doc, [d.businessName, d.providerName, d.providerAddress, d.providerContact], M, y, colW);
  const y2 = lines(doc, [d.parentName, d.children ? `Child(ren): ${d.children}` : ""], M + colW + 24, y, colW);
  y = Math.max(y1, y2) + 20;

  doc.setFillColor(...PEACH_SOFT);
  doc.roundedRect(M, y, W - M * 2, 58, 10, 10, "F");
  put(doc, "Amount received", M + 16, y + 24, 11, "normal", SOFT);
  put(doc, formatMoney(parseAmount(d.amount), d.currency), M + 16, y + 46, 22, "bold", INK);
  put(doc, `Paid by ${d.method}${d.reference.trim() ? ` (${d.reference.trim()})` : ""}`, W - M - 16, y + 34, 11, "normal", INK, "right");
  y += 84;

  const rows: [string, string][] = [];
  if (d.forPeriod.trim()) rows.push(["For", `Child care, ${d.forPeriod.trim()}`]);
  else rows.push(["For", "Child care services"]);
  if (d.notes.trim()) rows.push(["Notes", d.notes.trim()]);
  for (const [k, v] of rows) {
    put(doc, k, M, y, 11, "bold");
    y = lines(doc, [v], M + 70, y, W - M * 2 - 70);
    y += 6;
  }
  y += 10;
  doc.setDrawColor(...LINE);
  doc.line(M, y, W - M, y);
  y += 22;
  put(doc, "Thank you!", M, y, 12, "bold", PEACH);
  brandFooter(doc, M);
  return doc.output("blob");
}
