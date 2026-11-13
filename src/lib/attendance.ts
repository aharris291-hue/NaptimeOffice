import { slug } from "@/lib/provider";
import { INK, LINE, PEACH, PEACH_SOFT, SOFT, brandFooter, newDoc, prettyDate, put } from "@/lib/pdfKit";

export type SheetData = {
  providerName: string;
  businessName: string;
  weekOf: string;
  children: string;
  weekends: boolean;
};

export function sheetDays(d: SheetData): string[] {
  const names = d.weekends
    ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.weekOf)) return names;
  const [y, m, day] = d.weekOf.split("-").map(Number);
  const start = new Date(y, m - 1, day);
  return names.map((n, i) => {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    return `${n} ${dt.getMonth() + 1}/${dt.getDate()}`;
  });
}

export const sheetFileName = (d: SheetData) => `attendance-sheet-${d.weekOf || "week"}-${slug(d.businessName || d.providerName, "daycare")}.pdf`;

/** One landscape page per day-group: each child gets a row with time in, signature, time out, signature per day. */
export async function buildSheetPdf(d: SheetData): Promise<Blob> {
  const doc = await newDoc("landscape");
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const kids = d.children.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  const rows = Math.max(kids.length, 12);
  const days = sheetDays(d);

  days.forEach((day, i) => {
    if (i > 0) {
      doc.addPage("letter", "landscape");
      doc.setFillColor(...PEACH);
      doc.rect(0, 0, W, 8, "F");
    }
    let y = M + 14;
    put(doc, `Daily Sign-In / Sign-Out`, M, y, 18, "bold");
    put(doc, day, W - M, y, 14, "bold", PEACH, "right");
    y += 18;
    const sub = [d.businessName || d.providerName, d.weekOf ? `Week of ${prettyDate(d.weekOf)}` : ""].filter(Boolean).join("  ·  ");
    put(doc, sub, M, y, 10.5, "normal", SOFT);
    y += 20;

    const cols = [
      { label: "Child", w: 0.22 },
      { label: "Time in", w: 0.11 },
      { label: "Drop-off signature", w: 0.22 },
      { label: "Time out", w: 0.11 },
      { label: "Pick-up signature", w: 0.22 },
      { label: "Notes", w: 0.12 },
    ];
    const tableW = W - M * 2;
    const headerH = 22;
    const rowH = Math.min(40, (H - y - headerH - 50) / rows);
    doc.setFillColor(...PEACH_SOFT);
    doc.rect(M, y, tableW, headerH, "F");
    let x = M;
    for (const c of cols) {
      put(doc, c.label, x + 6, y + 15, 9.5, "bold", INK);
      x += c.w * tableW;
    }
    y += headerH;
    doc.setDrawColor(...LINE);
    for (let r = 0; r < rows; r++) {
      const ry = y + r * rowH;
      doc.rect(M, ry, tableW, rowH);
      let cx = M;
      for (const c of cols) {
        cx += c.w * tableW;
        if (cx < M + tableW - 1) doc.line(cx, ry, cx, ry + rowH);
      }
      if (kids[r]) put(doc, kids[r], M + 6, ry + rowH / 2 + 4, 11, "normal", INK);
    }
    brandFooter(doc, M);
  });
  return doc.output("blob");
}
