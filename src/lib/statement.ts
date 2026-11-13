// Year-end statement data and PDF builder.
// Runs only in the browser: nothing typed here is ever sent to a server.
import { SITE_DOMAIN, SITE_NAME } from "@/lib/site";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type StatementData = {
  country: "US" | "OTHER";
  currency: string;
  year: string;
  providerName: string;
  businessName: string;
  providerAddress: string;
  providerContact: string;
  taxId: string;
  parentName: string;
  parentAddress: string;
  children: string;
  mode: "total" | "monthly";
  total: string;
  monthly: string[];
  notes: string;
};

export function emptyStatement(): StatementData {
  return {
    country: "US",
    currency: "$",
    year: String(new Date().getMonth() < 6 ? new Date().getFullYear() - 1 : new Date().getFullYear()),
    providerName: "",
    businessName: "",
    providerAddress: "",
    providerContact: "",
    taxId: "",
    parentName: "",
    parentAddress: "",
    children: "",
    mode: "total",
    total: "",
    monthly: Array(12).fill(""),
    notes: "",
  };
}

/** Turns "1,250.50" or "$1250" into 1250.5. Returns 0 for blank or invalid. */
export function parseAmount(value: string): number {
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function statementTotal(d: StatementData): number {
  if (d.mode === "total") return parseAmount(d.total);
  return Math.round(d.monthly.reduce((sum, m) => sum + parseAmount(m), 0) * 100) / 100;
}

export function formatMoney(amount: number, symbol: string): string {
  const s = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol || ""}${s}`;
}

/** Problems that stop the PDF from being made. */
export function validate(d: StatementData): string[] {
  const errors: string[] = [];
  if (!d.providerName.trim()) errors.push("Add your name (the provider).");
  if (!d.providerAddress.trim()) errors.push("Add your address.");
  if (!d.parentName.trim()) errors.push("Add the parent or guardian's name.");
  if (!/^\d{4}$/.test(d.year.trim())) errors.push("Add the year as four digits, like 2026.");
  if (statementTotal(d) <= 0) errors.push("Add the amount paid during the year.");
  return errors;
}

/** Gentle warnings that don't block the PDF. */
export function warnings(d: StatementData): string[] {
  const w: string[] = [];
  if (d.country === "US" && !d.taxId.trim())
    w.push("US parents usually need your tax ID (EIN or SSN) to claim the child care credit.");
  return w;
}

export function statementFileName(d: StatementData): string {
  const who = d.parentName.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "family";
  return `${d.year}-childcare-statement-${who}.pdf`;
}

export async function buildStatementPdf(d: StatementData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 54;
  const peach: [number, number, number] = [232, 119, 90];
  const ink: [number, number, number] = [61, 44, 41];
  const soft: [number, number, number] = [107, 90, 85];
  const isUS = d.country === "US";
  let y = M;

  const text = (str: string, x: number, size = 11, style: "normal" | "bold" = "normal", color = ink) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(str, x, y);
  };
  const wrapped = (str: string, x: number, width: number, size = 11, color = ink) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(str, width) as string[];
    doc.text(lines, x, y);
    y += lines.length * size * 1.35;
  };

  // Header band
  doc.setFillColor(...peach);
  doc.rect(0, 0, W, 8, "F");
  y += 10;
  text(isUS ? "Year-End Child Care Statement" : "Annual Child Care Payment Summary", M, 20, "bold");
  y += 20;
  text(`${isUS ? "Tax year" : "Year"} ${d.year}  ·  January 1 – December 31, ${d.year}`, M, 11, "normal", soft);
  y += 30;

  // Two columns: provider and paid by
  const colW = (W - M * 2 - 24) / 2;
  const startY = y;
  const block = (title: string, lines: string[], x: number) => {
    y = startY;
    text(title.toUpperCase(), x, 9, "bold", peach);
    y += 16;
    for (const line of lines.filter(Boolean)) {
      for (const part of line.split("\n")) {
        const ls = doc.splitTextToSize(part, colW) as string[];
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(...ink);
        doc.text(ls, x, y);
        y += ls.length * 15;
      }
    }
    return y;
  };
  const providerLines = [
    d.businessName ? `${d.businessName}` : "",
    d.providerName,
    d.providerAddress,
    d.providerContact,
    isUS && d.taxId ? `Provider tax ID (EIN/SSN): ${d.taxId}` : !isUS && d.taxId ? `Provider ID: ${d.taxId}` : "",
  ];
  const y1 = block("Child care provider", providerLines, M);
  const y2 = block(
    "Paid by",
    [d.parentName, d.parentAddress, d.children ? `Child(ren): ${d.children}` : ""],
    M + colW + 24,
  );
  y = Math.max(y1, y2) + 18;

  // Payments
  doc.setDrawColor(240, 226, 214);
  doc.line(M, y, W - M, y);
  y += 24;
  text("PAYMENTS RECEIVED FOR CHILD CARE", M, 9, "bold", peach);
  y += 18;
  const total = statementTotal(d);
  if (d.mode === "monthly") {
    const rowH = 17;
    const half = 6;
    const cw = (W - M * 2) / 2;
    for (let i = 0; i < 12; i++) {
      const col = i < half ? 0 : 1;
      const row = i % half;
      const x = M + col * cw;
      const ry = y + row * rowH;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...ink);
      doc.text(MONTHS[i], x, ry);
      doc.text(formatMoney(parseAmount(d.monthly[i]), d.currency), x + cw - 24, ry, { align: "right" });
    }
    y += half * rowH + 8;
  }
  doc.setFillColor(253, 230, 220);
  doc.roundedRect(M, y - 4, W - M * 2, 34, 8, 8, "F");
  y += 17;
  text(`Total paid in ${d.year}`, M + 14, 13, "bold");
  doc.setFont("helvetica", "bold");
  doc.text(formatMoney(total, d.currency), W - M - 14, y, { align: "right" });
  y += 38;

  // Confirmation
  const who = d.businessName || d.providerName;
  wrapped(
    `This statement confirms that ${d.parentName} paid ${formatMoney(total, d.currency)} to ${who} for child care services` +
      `${d.children ? ` for ${d.children}` : ""} between January 1 and December 31, ${d.year}.`,
    M,
    W - M * 2,
  );
  if (d.notes.trim()) {
    y += 6;
    wrapped(`Notes: ${d.notes.trim()}`, M, W - M * 2, 10, soft);
  }
  y += 34;

  // Signature
  doc.setDrawColor(...ink);
  doc.line(M, y, M + 230, y);
  doc.line(W - M - 150, y, W - M, y);
  y += 14;
  text("Provider signature", M, 9, "normal", soft);
  text("Date", W - M - 150, 9, "normal", soft);

  // Footer
  y = H - 64;
  if (isUS) {
    wrapped(
      "Parents may use this statement for IRS Form 2441 (Child and Dependent Care Expenses) or a dependent care FSA claim. " +
        "This statement is a record of payments and is not tax advice.",
      M,
      W - M * 2,
      8.5,
      soft,
    );
  }
  y = H - 28;
  text(`Made free with ${SITE_NAME} · ${SITE_DOMAIN}`, M, 8.5, "normal", peach);

  return doc.output("blob");
}
