// Shared PDF look for every free tool: peach top band, warm colors, branded footer.
import type { jsPDF as JsPDF } from "jspdf";
import { SITE_DOMAIN, SITE_NAME } from "@/lib/site";

export const PEACH: [number, number, number] = [232, 119, 90];
export const PEACH_SOFT: [number, number, number] = [253, 230, 220];
export const INK: [number, number, number] = [61, 44, 41];
export const SOFT: [number, number, number] = [107, 90, 85];
export const LINE: [number, number, number] = [240, 226, 214];

export async function newDoc(orientation: "portrait" | "landscape" = "portrait") {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation });
  doc.setFillColor(...PEACH);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 8, "F");
  return doc;
}

export function put(
  doc: JsPDF,
  str: string | string[],
  x: number,
  y: number,
  size = 11,
  style: "normal" | "bold" = "normal",
  color = INK,
  align: "left" | "right" | "center" = "left",
) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(str, x, y, { align });
}

/** Writes lines (splitting on newlines and wrapping) and returns the new y. */
export function lines(doc: JsPDF, items: string[], x: number, y: number, width: number, size = 11, color = INK) {
  for (const item of items.filter(Boolean)) {
    for (const part of item.split("\n")) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      doc.setTextColor(...color);
      const ls = doc.splitTextToSize(part, width) as string[];
      doc.text(ls, x, y);
      y += ls.length * size * 1.35;
    }
  }
  return y;
}

export function brandFooter(doc: JsPDF, margin = 54) {
  const H = doc.internal.pageSize.getHeight();
  put(doc, `Made free with ${SITE_NAME} · ${SITE_DOMAIN}`, margin, H - 28, 8.5, "normal", PEACH);
}

export function parseAmount(value: string): number {
  const n = Number.parseFloat(value.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function formatMoney(amount: number, symbol: string): string {
  return `${symbol || ""}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function prettyDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
