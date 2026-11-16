// Daily care: quick log options, nap durations, and the PDFs parents receive.
import type { jsPDF as JsPDF } from "jspdf";
import type { Child, DailyEntry, EntryKind, Incident, MedDose, Medication, Provider, Supply } from "./types";
import { clock, localDate } from "./time";

const day = (iso: string) => localDate(new Date(iso));
import { INK, PEACH, SOFT, brandFooter, lines, newDoc, prettyDate, put } from "@/lib/pdfKit";

export const KINDS: { kind: EntryKind; icon: string; label: string; options: string[] }[] = [
  { kind: "meal", icon: "🍎", label: "Meal", options: ["Ate all", "Ate most", "Ate some", "Ate none"] },
  { kind: "bottle", icon: "🍼", label: "Bottle", options: ["2 oz", "4 oz", "6 oz", "8 oz"] },
  { kind: "diaper", icon: "🧷", label: "Diaper", options: ["Wet", "BM", "Wet + BM", "Dry"] },
  { kind: "potty", icon: "🚽", label: "Potty", options: ["Success", "Tried", "Accident"] },
  { kind: "mood", icon: "😊", label: "Mood", options: ["Happy", "Calm", "Fussy", "Sad", "Tired"] },
  { kind: "activity", icon: "🎨", label: "Activity", options: ["Outside play", "Art", "Story time", "Music", "Sensory", "Blocks"] },
  { kind: "note", icon: "📝", label: "Note", options: [] },
];

export const MEALS = ["Breakfast", "Morning snack", "Lunch", "Afternoon snack", "Dinner"];
export const SUPPLY_ITEMS = ["Diapers", "Wipes", "Formula", "Spare clothes", "Diaper cream", "Sunscreen"];
export const INCIDENT_KINDS = ["Injury", "Illness", "Bite", "Behavior", "Other"];

export function minutesBetween(a: string, b: string | null, now = Date.now()) {
  return Math.max(0, Math.round(((b ? new Date(b).getTime() : now) - new Date(a).getTime()) / 60000));
}

export function duration(min: number) {
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

export const kindInfo = (k: EntryKind) => KINDS.find((x) => x.kind === k) ?? { kind: k, icon: "😴", label: "Nap", options: [] };

export function entryText(e: DailyEntry) {
  if (e.kind === "nap") return e.ended_at ? `Napped ${clock(e.started_at)} to ${clock(e.ended_at)} (${duration(minutesBetween(e.started_at, e.ended_at))})` : `Napping since ${clock(e.started_at)}`;
  const label = kindInfo(e.kind).label;
  return [e.value ? `${label}: ${e.value}` : label, e.note].filter(Boolean).join(" · ");
}

/** Draws a finger signature (SVG path in a 300x120 box) into a PDF. */
export function drawSignature(doc: JsPDF, path: string | null, x: number, y: number, w = 150) {
  if (!path) return;
  const s = w / 300;
  doc.setDrawColor(...INK);
  doc.setLineWidth(1.2);
  let last: [number, number] | null = null;
  const parts = path.trim().split(/\s+/);
  for (let i = 0; i < parts.length; i += 3) {
    const [cmd, px, py] = [parts[i], Number(parts[i + 1]), Number(parts[i + 2])];
    const pt: [number, number] = [x + px * s, y + py * s];
    if (cmd === "L" && last) doc.line(last[0], last[1], pt[0], pt[1]);
    last = pt;
  }
}

function header(doc: JsPDF, title: string, sub: string, provider: Provider) {
  const W = doc.internal.pageSize.getWidth();
  put(doc, title, 54, 64, 22, "bold");
  put(doc, sub, 54, 84, 11, "normal", SOFT);
  put(doc, provider.business_name || provider.provider_name, W - 54, 64, 11, "bold", INK, "right");
  if (provider.phone) put(doc, provider.phone, W - 54, 80, 10, "normal", SOFT, "right");
  return 116;
}

function newPageIfNeeded(doc: JsPDF, y: number) {
  if (y < doc.internal.pageSize.getHeight() - 80) return y;
  doc.addPage();
  return 64;
}

export async function dailyReportPdf(child: Child, date: string, entries: DailyEntry[], doses: (MedDose & { med: string })[], supplies: Supply[], provider: Provider) {
  const doc = await newDoc();
  const W = doc.internal.pageSize.getWidth();
  let y = header(doc, `${child.first_name}'s day`, prettyDate(date), provider);
  const sections: [string, string[]][] = [
    ["MEALS AND BOTTLES", entries.filter((e) => e.kind === "meal" || e.kind === "bottle").map((e) => `${clock(e.started_at)}  ${entryText(e)}`)],
    ["NAPS", entries.filter((e) => e.kind === "nap").map((e) => entryText(e))],
    ["DIAPERS AND POTTY", entries.filter((e) => e.kind === "diaper" || e.kind === "potty").map((e) => `${clock(e.started_at)}  ${entryText(e)}`)],
    ["MOOD AND ACTIVITIES", entries.filter((e) => e.kind === "mood" || e.kind === "activity").map((e) => `${clock(e.started_at)}  ${entryText(e)}`)],
    ["MEDICINE GIVEN", doses.map((d) => `${clock(d.given_at)}  ${d.med} ${d.dose} (given by ${d.given_by})`)],
    ["NOTES", entries.filter((e) => e.kind === "note").map((e) => `${clock(e.started_at)}  ${e.note || e.value}`)],
    ["PLEASE BRING", supplies.filter((s) => s.level !== "plenty").map((s) => `${s.item} (${s.level === "out" ? "all out" : "running low"})`)],
  ];
  for (const [title, items] of sections) {
    if (!items.length) continue;
    y = newPageIfNeeded(doc, y);
    put(doc, title, 54, y, 9, "bold", PEACH);
    y = lines(doc, items, 54, y + 16, W - 108) + 12;
  }
  brandFooter(doc);
  return { blob: doc.output("blob"), name: `${child.first_name.toLowerCase()}-daily-report-${date}.pdf` };
}

export async function incidentPdf(inc: Incident, child: Child, provider: Provider) {
  const doc = await newDoc();
  const W = doc.internal.pageSize.getWidth();
  let y = header(doc, `${inc.kind} report`, `${child.first_name} ${child.last_name} · ${prettyDate(day(inc.happened_at))} at ${clock(inc.happened_at)}`, provider);
  const rows: [string, string][] = [
    ["WHERE IT HAPPENED", inc.location],
    ["WHAT HAPPENED", inc.description],
    ["WHAT WE DID", inc.action_taken],
    ["WITNESSED BY", inc.witnessed_by],
    ["PARENT NOTIFIED", inc.parent_notified_at ? `${inc.parent_name || "Parent"} on ${prettyDate(day(inc.parent_notified_at))} at ${clock(inc.parent_notified_at)}` : "Not yet"],
  ];
  for (const [k, v] of rows) {
    if (!v) continue;
    put(doc, k, 54, y, 9, "bold", PEACH);
    y = lines(doc, [v], 54, y + 16, W - 108) + 12;
  }
  y = newPageIfNeeded(doc, y + 10);
  const colW = (W - 108) / 2;
  put(doc, "PROVIDER SIGNATURE", 54, y, 9, "bold", PEACH);
  put(doc, "PARENT SIGNATURE", 54 + colW, y, 9, "bold", PEACH);
  drawSignature(doc, inc.provider_signature, 54, y + 6);
  drawSignature(doc, inc.parent_signature, 54 + colW, y + 6);
  brandFooter(doc);
  return { blob: doc.output("blob"), name: `${child.first_name.toLowerCase()}-${inc.kind.toLowerCase()}-report-${day(inc.happened_at)}.pdf` };
}

export async function medLogPdf(med: Medication, doses: MedDose[], child: Child, provider: Provider) {
  const doc = await newDoc();
  const W = doc.internal.pageSize.getWidth();
  let y = header(doc, "Medication log", `${child.first_name} ${child.last_name} · ${med.name}`, provider);
  y = lines(doc, [
    `Dose: ${med.dose || "as directed"}`,
    med.instructions ? `Instructions: ${med.instructions}` : "",
    `Dates: ${prettyDate(med.start_date)}${med.end_date ? ` to ${prettyDate(med.end_date)}` : " onward"}`,
    `Permission given by: ${med.authorized_by}`,
  ], 54, y, W - 108);
  drawSignature(doc, med.authorized_signature, 54, y);
  y += 72;
  put(doc, "DOSES GIVEN", 54, y, 9, "bold", PEACH);
  y += 16;
  for (const d of doses) {
    y = newPageIfNeeded(doc, y);
    y = lines(doc, [`${prettyDate(day(d.given_at))} ${clock(d.given_at)}  ·  ${d.dose || med.dose}  ·  given by ${d.given_by}${d.note ? `  ·  ${d.note}` : ""}`], 54, y, W - 108);
  }
  if (!doses.length) lines(doc, ["No doses recorded yet."], 54, y, W - 108, 11, SOFT);
  brandFooter(doc);
  return { blob: doc.output("blob"), name: `${child.first_name.toLowerCase()}-${med.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-log.pdf` };
}
