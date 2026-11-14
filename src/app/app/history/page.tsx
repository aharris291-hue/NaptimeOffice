"use client";

import { useState } from "react";
import { useApp } from "@/components/app/AuthGate";
import Sheet from "@/components/app/Sheet";
import { SignatureView } from "@/components/app/SignaturePad";
import { useAttendance, useRoster } from "@/lib/app/data";
import { supabase } from "@/lib/app/supabase";
import { clock, lateFee, lateMinutes, localDate } from "@/lib/app/time";
import type { Attendance, Provider } from "@/lib/app/types";

function hoursBetween(a: string | null, b: string | null) {
  if (!a || !b) return 0;
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000);
}

function timeInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function atTime(date: string, hhmm: string): string | null {
  if (!hhmm) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi).toISOString();
}

export default function HistoryPage() {
  const { provider } = useApp();
  const [date, setDate] = useState(localDate());
  const { data } = useRoster();
  const { rows, error, reload } = useAttendance(date);
  const [edit, setEdit] = useState<Attendance | null>(null);
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [exporting, setExporting] = useState(false);

  const childName = (id: string) => {
    const c = data?.children.find((k) => k.id === id);
    return c ? `${c.first_name} ${c.last_name}`.trim() : "Unknown child";
  };

  async function exportMonth() {
    setExporting(true);
    const [y, m] = month.split("-").map(Number);
    const end = localDate(new Date(y, m, 0));
    const { data: all, error } = await supabase()
      .from("attendance")
      .select("*")
      .gte("care_date", `${month}-01`)
      .lte("care_date", end)
      .order("care_date")
      .order("check_in");
    setExporting(false);
    if (error) return alert(error.message);
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ["Date", "Child", "Time in", "Signed in by", "Time out", "Signed out by", "Hours", "Late minutes", "Late fee", "Notes"].map(esc).join(","),
      ...(all as Attendance[]).map((r) =>
        [r.care_date, childName(r.child_id), clock(r.check_in), r.in_by, clock(r.check_out), r.out_by, hoursBetween(r.check_in, r.check_out).toFixed(2), r.late_minutes, Number(r.late_fee).toFixed(2), r.notes].map(esc).join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Attendance records</h1>
      <label className="block">
        <span className="field-label">Day</span>
        <input type="date" className="field-input" value={date} max={localDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>
      {error && <p className="text-peach-dark">{error}</p>}
      {rows && rows.length === 0 && <p className="card text-ink-soft">No sign-ins recorded on this day.</p>}
      <ul className="space-y-2">
        {rows?.map((r) => (
          <li key={r.id}>
            <button className="card w-full py-3 text-left" onClick={() => setEdit(r)}>
              <span className="flex justify-between font-bold">
                <span>{childName(r.child_id)}</span>
                <span>{hoursBetween(r.check_in, r.check_out).toFixed(2)} h</span>
              </span>
              <span className="mt-1 grid grid-cols-2 gap-2 text-sm text-ink-soft">
                <span>
                  In {clock(r.check_in)} · {r.in_by}
                  <SignatureView path={r.in_signature} className="mt-1 h-10" />
                </span>
                <span>
                  {r.check_out ? `Out ${clock(r.check_out)} · ${r.out_by}` : "Still here"}
                  <SignatureView path={r.out_signature} className="mt-1 h-10" />
                </span>
              </span>
              {Number(r.late_fee) > 0 && (
                <span className="mt-1 block text-sm font-semibold text-peach-dark">
                  {r.late_minutes} min late · fee {provider.currency}{Number(r.late_fee).toFixed(2)}
                </span>
              )}
              {r.notes && <span className="mt-1 block text-sm">Note: {r.notes}</span>}
            </button>
          </li>
        ))}
      </ul>

      <div className="card space-y-3">
        <h2 className="font-bold">Download for your licensing records</h2>
        <p className="text-sm text-ink-soft">A spreadsheet of every sign-in and sign-out for the month, with times, names and hours.</p>
        <div className="flex gap-2">
          <input type="month" className="field-input" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <button className="btn-secondary shrink-0 px-4" onClick={exportMonth} disabled={exporting}>{exporting ? "…" : "Download"}</button>
        </div>
      </div>

      {edit && (
        <Sheet title={`Fix record for ${childName(edit.child_id)}`} onClose={() => setEdit(null)}>
          <EditRecord row={edit} provider={provider} onDone={() => { setEdit(null); reload(); }} />
        </Sheet>
      )}
    </div>
  );
}

function EditRecord({ row, provider, onDone }: { row: Attendance; provider: Provider; onDone: () => void }) {
    const [inT, setIn] = useState(timeInput(row.check_in));
    const [outT, setOut] = useState(timeInput(row.check_out));
    const [notes, setNotes] = useState(row.notes);
    const [err, setErr] = useState<string | null>(null);
    async function save(e: React.FormEvent) {
      e.preventDefault();
      const check_in = atTime(row.care_date, inT);
      const check_out = atTime(row.care_date, outT);
      if (check_in && check_out && check_out < check_in) return setErr("Time out is before time in.");
      const late = check_out ? lateMinutes(new Date(check_out), provider) : 0;
      const { error } = await supabase()
        .from("attendance")
        .update({ check_in, check_out, notes, late_minutes: late, late_fee: lateFee(late, provider) })
        .eq("id", row.id);
      if (error) return setErr(error.message);
      onDone();
    }
    async function remove() {
      if (!confirm("Delete this attendance record?")) return;
      const { error } = await supabase().from("attendance").delete().eq("id", row.id);
      if (error) return setErr(error.message);
      onDone();
    }
    return (
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm text-ink-soft">Correct a time if someone forgot to sign. Add a note saying why, for your records.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="field-label">Time in</span><input type="time" className="field-input" value={inT} onChange={(e) => setIn(e.target.value)} /></label>
          <label className="block"><span className="field-label">Time out</span><input type="time" className="field-input" value={outT} onChange={(e) => setOut(e.target.value)} /></label>
        </div>
        <label className="block"><span className="field-label">Note</span><textarea className="field-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {err && <p className="font-semibold text-peach-dark">{err}</p>}
        <button className="btn-primary w-full">Save changes</button>
        <button type="button" className="w-full text-sm font-semibold text-peach-dark" onClick={remove}>Delete record</button>
      </form>
    );
  }
