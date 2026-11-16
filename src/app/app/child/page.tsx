"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/app/AuthGate";
import Sheet from "@/components/app/Sheet";
import SignaturePad from "@/components/app/SignaturePad";
import { useRoster } from "@/lib/app/data";
import { shareOrDownload } from "@/lib/app/billing";
import {
  INCIDENT_KINDS,
  KINDS,
  MEALS,
  SUPPLY_ITEMS,
  dailyReportPdf,
  duration,
  entryText,
  incidentPdf,
  kindInfo,
  medLogPdf,
  minutesBetween,
} from "@/lib/app/care";
import { supabase } from "@/lib/app/supabase";
import { ageLabel, clock, localDate } from "@/lib/app/time";
import type { Child, DailyEntry, EntryKind, Incident, MedDose, Medication, Provider, Supply } from "@/lib/app/types";
import { prettyDate } from "@/lib/pdfKit";

type Day = { entries: DailyEntry[]; supplies: Supply[]; meds: Medication[]; doses: MedDose[]; incidents: Incident[] };

export default function ChildPage() {
  return (
    <Suspense fallback={<p className="text-ink-soft">Loading…</p>}>
      <ChildDay />
    </Suspense>
  );
}

/** Re-renders every 30 seconds so nap timers tick. */
function useTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
}

function ChildDay() {
  const id = useSearchParams().get("id");
  const { provider } = useApp();
  const roster = useRoster();
  const today = localDate();
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState<EntryKind | null>(null);
  const [sheet, setSheet] = useState<"med" | "incident" | null>(null);
  const [dosing, setDosing] = useState<Medication | null>(null);
  const [signing, setSigning] = useState<Incident | null>(null);
  useTick();

  const load = useCallback(async () => {
    if (!id) return;
    const sb = supabase();
    const [e, s, m, d, i] = await Promise.all([
      sb.from("daily_entries").select("*").eq("child_id", id).eq("care_date", today).order("started_at"),
      sb.from("supplies").select("*").eq("child_id", id),
      sb.from("medications").select("*").eq("child_id", id).order("created_at", { ascending: false }),
      sb.from("med_doses").select("*").eq("child_id", id).order("given_at", { ascending: false }).limit(200),
      sb.from("incidents").select("*").eq("child_id", id).order("happened_at", { ascending: false }).limit(50),
    ]);
    const err = e.error || s.error || m.error || d.error || i.error;
    if (err) return setError(err.message);
    setDay({ entries: e.data as DailyEntry[], supplies: s.data as Supply[], meds: m.data as Medication[], doses: d.data as MedDose[], incidents: i.data as Incident[] });
  }, [id, today]);

  useEffect(() => {
    load();
  }, [load]);

  const child = roster.data?.children.find((c) => c.id === id);
  if (error || roster.error) return <p className="text-peach-dark">{error || roster.error}</p>;
  if (!roster.data || !day) return <p className="text-ink-soft">Loading…</p>;
  if (!child) return <p className="card">Child not found. <Link href="/app" className="font-semibold text-peach-dark">Back to Today</Link></p>;

  const sb = supabase();
  const nap = day.entries.find((e) => e.kind === "nap" && !e.ended_at);
  const todayDoses = day.doses.filter((d) => localDate(new Date(d.given_at)) === today);
  const activeMeds = day.meds.filter((m) => m.active && (!m.end_date || m.end_date >= today));

  async function toggleNap() {
    const r = nap
      ? await sb.from("daily_entries").update({ ended_at: new Date().toISOString() }).eq("id", nap.id)
      : await sb.from("daily_entries").insert({ provider_id: provider.id, child_id: child!.id, care_date: today, kind: "nap" });
    if (r.error) return setError(r.error.message);
    load();
  }

  async function removeEntry(e: DailyEntry) {
    if (!confirm(`Remove "${entryText(e)}"?`)) return;
    await sb.from("daily_entries").delete().eq("id", e.id);
    load();
  }

  async function cycleSupply(item: string) {
    const cur = day!.supplies.find((s) => s.item === item)?.level ?? "plenty";
    const next = cur === "plenty" ? "low" : cur === "low" ? "out" : "plenty";
    const { error } = await sb.from("supplies").upsert({ provider_id: provider.id, child_id: child!.id, item, level: next, updated_at: new Date().toISOString() }, { onConflict: "child_id,item" });
    if (error) return setError(error.message);
    load();
  }

  async function shareReport() {
    const doses = todayDoses.map((d) => ({ ...d, med: day!.meds.find((m) => m.id === d.medication_id)?.name ?? "Medicine" }));
    const { blob, name } = await dailyReportPdf(child!, today, day!.entries, doses, day!.supplies, provider);
    await shareOrDownload(blob, name, `${child!.first_name}'s day at ${provider.business_name || "daycare"}`);
  }

  return (
    <div className="space-y-5">
      <Link href="/app" className="text-sm font-semibold text-ink-soft">‹ Today</Link>
      <div>
        <h1 className="text-2xl font-extrabold">{child.first_name} {child.last_name}</h1>
        <p className="text-ink-soft">{ageLabel(child.birth_date)}</p>
        {child.allergies && <p className="mt-2 rounded-xl bg-peach-soft px-3 py-2 font-semibold text-peach-dark">⚠️ Allergies: {child.allergies}</p>}
      </div>

      <button onClick={toggleNap} className={`w-full rounded-3xl p-4 text-left text-lg font-extrabold ${nap ? "bg-sage text-white" : "bg-sage-soft"}`}>
        {nap ? `😴 Napping ${duration(minutesBetween(nap.started_at, null))} · tap when awake` : "😴 Start nap"}
      </button>

      <div className="grid grid-cols-4 gap-2">
        {KINDS.map((k) => (
          <button key={k.kind} onClick={() => setLogging(k.kind)} className="card flex flex-col items-center gap-1 px-1 py-3 text-xs font-bold">
            <span className="text-2xl" aria-hidden>{k.icon}</span>
            {k.label}
          </button>
        ))}
        <button onClick={shareReport} className="card flex flex-col items-center gap-1 bg-peach-soft px-1 py-3 text-xs font-bold">
          <span className="text-2xl" aria-hidden>📤</span>
          Daily report
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="font-bold">Today</h2>
        {day.entries.length === 0 && todayDoses.length === 0 && <p className="text-sm text-ink-soft">Nothing logged yet. Tap a button above.</p>}
        <ul className="space-y-1">
          {day.entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2">
              <span aria-hidden>{kindInfo(e.kind).icon}</span>
              <span className="flex-1 text-sm">{e.kind !== "nap" && <b className="mr-1">{clock(e.started_at)}</b>}{entryText(e)}</span>
              <button className="text-lg text-ink-soft" aria-label="Remove" onClick={() => removeEntry(e)}>×</button>
            </li>
          ))}
          {todayDoses.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2 text-sm">
              <span aria-hidden>💊</span>
              <span><b className="mr-1">{clock(d.given_at)}</b>{day.meds.find((m) => m.id === d.medication_id)?.name} {d.dose} · {d.given_by}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Supplies <span className="text-sm font-normal text-ink-soft">(tap to change)</span></h2>
        <div className="flex flex-wrap gap-2">
          {SUPPLY_ITEMS.map((item) => {
            const lvl = day.supplies.find((s) => s.item === item)?.level ?? "plenty";
            return (
              <button key={item} onClick={() => cycleSupply(item)}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${lvl === "out" ? "bg-peach text-white" : lvl === "low" ? "bg-sun" : "bg-sage-soft"}`}>
                {item}: {lvl === "plenty" ? "OK" : lvl === "low" ? "Low" : "Out"}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Medicine</h2>
          <button className="text-sm font-bold text-peach-dark" onClick={() => setSheet("med")}>+ Parent permission</button>
        </div>
        {day.meds.length === 0 && <p className="text-sm text-ink-soft">No medicine on file. Add a parent&apos;s signed permission before giving any.</p>}
        {day.meds.map((m) => {
          const active = activeMeds.includes(m);
          const last = day.doses.find((d) => d.medication_id === m.id);
          return (
            <div key={m.id} className={`rounded-2xl border border-line p-3 ${active ? "" : "opacity-60"}`}>
              <p className="font-bold">{m.name} <span className="font-normal text-ink-soft">{m.dose}</span></p>
              {m.instructions && <p className="text-sm">{m.instructions}</p>}
              <p className="text-sm text-ink-soft">{last ? `Last given ${prettyDate(localDate(new Date(last.given_at)))} at ${clock(last.given_at)}` : "Not given yet"}{active ? "" : " · Permission ended"}</p>
              <div className="mt-2 flex gap-4 text-sm font-bold">
                {active && <button className="text-sage" onClick={() => setDosing(m)}>Give dose</button>}
                <button className="text-peach-dark" onClick={async () => {
                  const { blob, name } = await medLogPdf(m, day.doses.filter((d) => d.medication_id === m.id).reverse(), child, provider);
                  await shareOrDownload(blob, name, `${m.name} log for ${child.first_name}`);
                }}>Log PDF</button>
                {active && <button className="text-ink-soft" onClick={async () => { await sb.from("medications").update({ active: false }).eq("id", m.id); load(); }}>Stop</button>}
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Incident reports</h2>
          <button className="text-sm font-bold text-peach-dark" onClick={() => setSheet("incident")}>+ Report</button>
        </div>
        {day.incidents.length === 0 && <p className="text-sm text-ink-soft">None. Bumps, bites, illness and behavior notes go here.</p>}
        {day.incidents.map((inc) => (
          <div key={inc.id} className="rounded-2xl border border-line p-3">
            <p className="font-bold">{inc.kind} · {prettyDate(localDate(new Date(inc.happened_at)))} {clock(inc.happened_at)}</p>
            <p className="text-sm">{inc.description}</p>
            <div className="mt-2 flex gap-4 text-sm font-bold">
              {!inc.parent_signature ? <button className="text-sage" onClick={() => setSigning(inc)}>Parent signs</button> : <span className="text-ink-soft">Signed by {inc.parent_name}</span>}
              <button className="text-peach-dark" onClick={async () => {
                const { blob, name } = await incidentPdf(inc, child, provider);
                await shareOrDownload(blob, name, `${inc.kind} report for ${child.first_name}`);
              }}>PDF</button>
            </div>
          </div>
        ))}
      </section>

      {logging && (
        <Sheet title={`${kindInfo(logging).icon} ${kindInfo(logging).label}`} onClose={() => setLogging(null)}>
          <LogForm kind={logging} child={child} provider={provider} onDone={() => { setLogging(null); load(); }} />
        </Sheet>
      )}
      {sheet === "med" && (
        <Sheet title="Medicine permission" onClose={() => setSheet(null)}>
          <MedForm child={child} provider={provider} onDone={() => { setSheet(null); load(); }} />
        </Sheet>
      )}
      {dosing && (
        <Sheet title={`Give ${dosing.name}`} onClose={() => setDosing(null)}>
          <DoseForm med={dosing} provider={provider} lastGiven={day.doses.find((d) => d.medication_id === dosing.id)?.given_at ?? null} onDone={() => { setDosing(null); load(); }} />
        </Sheet>
      )}
      {sheet === "incident" && (
        <Sheet title="Incident report" onClose={() => setSheet(null)}>
          <IncidentForm child={child} provider={provider} onDone={() => { setSheet(null); load(); }} />
        </Sheet>
      )}
      {signing && (
        <Sheet title="Parent signature" onClose={() => setSigning(null)}>
          <ParentSign incident={signing} child={child} onDone={() => { setSigning(null); load(); }} />
        </Sheet>
      )}
    </div>
  );
}

function nowLocal() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function todayAt(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${value === o ? "border-peach bg-peach-soft" : "border-line text-ink-soft"}`}>{o}</button>
      ))}
    </div>
  );
}

function LogForm({ kind, child, provider, onDone }: { kind: EntryKind; child: Child; provider: Provider; onDone: () => void }) {
  const info = kindInfo(kind);
  const [meal, setMeal] = useState(MEALS[new Date().getHours() < 10 ? 0 : new Date().getHours() < 12 ? 1 : new Date().getHours() < 14 ? 2 : 3]);
  const [value, setValue] = useState(info.options[0] ?? "");
  const [note, setNote] = useState("");
  const [time, setTime] = useState(nowLocal());
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "note" && !note.trim()) return setErr("Write the note.");
    const { error } = await supabase().from("daily_entries").insert({
      provider_id: provider.id,
      child_id: child.id,
      care_date: localDate(),
      kind,
      started_at: todayAt(time),
      value: kind === "meal" ? `${meal}: ${value}` : value,
      note: note.trim(),
    });
    if (error) return setErr(error.message);
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {kind === "meal" && <Chips options={MEALS} value={meal} onChange={setMeal} />}
      {info.options.length > 0 && <Chips options={info.options} value={value} onChange={setValue} />}
      {kind === "bottle" || kind === "activity" ? (
        <input className="field-input" placeholder={kind === "bottle" ? "Or type an amount" : "Or describe it"} value={value} onChange={(e) => setValue(e.target.value)} />
      ) : null}
      <label className="block"><span className="field-label">{kind === "note" ? "Note for parents" : "Note (optional)"}</span><textarea className="field-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "meal" ? "e.g. Mac and cheese, peas, milk" : ""} /></label>
      <label className="block"><span className="field-label">Time</span><input type="time" className="field-input" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full">Save</button>
    </form>
  );
}

function MedForm({ child, provider, onDone }: { child: Child; provider: Provider; onDone: () => void }) {
  const [m, setM] = useState({ name: "", dose: "", instructions: "", start_date: localDate(), end_date: "", authorized_by: "" });
  const [sig, setSig] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!m.name.trim()) return setErr("Enter the medicine name.");
    if (!m.authorized_by.trim() || !sig) return setErr("The parent needs to type their name and sign.");
    const { error } = await supabase().from("medications").insert({ ...m, end_date: m.end_date || null, authorized_signature: sig, provider_id: provider.id, child_id: child.id });
    if (error) return setErr(error.message);
    onDone();
  }
  const f = (k: keyof typeof m, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block"><span className="field-label">{label}</span><input className="field-input" value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} {...extra} /></label>
  );
  return (
    <form onSubmit={save} className="space-y-3">
      <p className="text-sm text-ink-soft">Hand the phone to the parent to fill in and sign.</p>
      {f("name", "Medicine", { placeholder: "e.g. Children's Tylenol" })}
      {f("dose", "Dose", { placeholder: "e.g. 5 ml" })}
      {f("instructions", "When to give it", { placeholder: "e.g. Every 6 hours if fever over 101°F" })}
      <div className="grid grid-cols-2 gap-3">
        {f("start_date", "From", { type: "date" })}
        {f("end_date", "Until (optional)", { type: "date" })}
      </div>
      {f("authorized_by", "Parent's name")}
      <SignaturePad onChange={setSig} />
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full">Save permission</button>
    </form>
  );
}

function DoseForm({ med, provider, lastGiven, onDone }: { med: Medication; provider: Provider; lastGiven: string | null; onDone: () => void }) {
  const [dose, setDose] = useState(med.dose);
  const [by, setBy] = useState(provider.provider_name);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!by.trim()) return setErr("Enter who gave it.");
    const { error } = await supabase().from("med_doses").insert({ provider_id: provider.id, medication_id: med.id, child_id: med.child_id, dose, given_by: by.trim(), note });
    if (error) return setErr(error.message);
    onDone();
  }
  return (
    <form onSubmit={save} className="space-y-3">
      {med.instructions && <p className="rounded-xl bg-cream px-3 py-2 text-sm"><b>Parent&apos;s instructions:</b> {med.instructions}</p>}
      {lastGiven && <p className="text-sm font-semibold">Last dose: {clock(lastGiven)} ({duration(minutesBetween(lastGiven, null))} ago)</p>}
      <label className="block"><span className="field-label">Dose</span><input className="field-input" value={dose} onChange={(e) => setDose(e.target.value)} /></label>
      <label className="block"><span className="field-label">Given by</span><input className="field-input" value={by} onChange={(e) => setBy(e.target.value)} /></label>
      <label className="block"><span className="field-label">Note (optional)</span><input className="field-input" placeholder="e.g. Temp was 101.4°F" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full">Record dose now</button>
    </form>
  );
}

function IncidentForm({ child, provider, onDone }: { child: Child; provider: Provider; onDone: () => void }) {
  const [i, setI] = useState({ kind: INCIDENT_KINDS[0], time: nowLocal(), location: "", description: "", action_taken: "", witnessed_by: provider.provider_name });
  const [sig, setSig] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!i.description.trim()) return setErr("Describe what happened.");
    if (!sig) return setErr("Sign the report.");
    const { error } = await supabase().from("incidents").insert({
      provider_id: provider.id,
      child_id: child.id,
      happened_at: todayAt(i.time),
      kind: i.kind,
      location: i.location,
      description: i.description,
      action_taken: i.action_taken,
      witnessed_by: i.witnessed_by,
      provider_signature: sig,
    });
    if (error) return setErr(error.message);
    onDone();
  }
  const set = (k: keyof typeof i) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setI({ ...i, [k]: e.target.value });
  return (
    <form onSubmit={save} className="space-y-3">
      <Chips options={INCIDENT_KINDS} value={i.kind} onChange={(v) => setI({ ...i, kind: v })} />
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="field-label">Time</span><input type="time" className="field-input" value={i.time} onChange={set("time")} /></label>
        <label className="block"><span className="field-label">Where</span><input className="field-input" placeholder="e.g. Backyard" value={i.location} onChange={set("location")} /></label>
      </div>
      <label className="block"><span className="field-label">What happened</span><textarea className="field-input" rows={3} value={i.description} onChange={set("description")} /></label>
      <label className="block"><span className="field-label">What you did</span><textarea className="field-input" rows={2} placeholder="e.g. Cleaned, ice pack for 10 minutes, comforted" value={i.action_taken} onChange={set("action_taken")} /></label>
      <label className="block"><span className="field-label">Witnessed by</span><input className="field-input" value={i.witnessed_by} onChange={set("witnessed_by")} /></label>
      <p className="field-label">Your signature</p>
      <SignaturePad onChange={setSig} />
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full">Save report</button>
    </form>
  );
}

function ParentSign({ incident, child, onDone }: { incident: Incident; child: Child; onDone: () => void }) {
  const [name, setName] = useState("");
  const [sig, setSig] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !sig) return setErr("Type your name and sign.");
    const { error } = await supabase().from("incidents").update({ parent_name: name.trim(), parent_signature: sig, parent_notified_at: new Date().toISOString() }).eq("id", incident.id);
    if (error) return setErr(error.message);
    onDone();
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <p className="rounded-xl bg-cream px-3 py-2 text-sm"><b>{incident.kind}:</b> {incident.description}{incident.action_taken ? ` What we did: ${incident.action_taken}` : ""}</p>
      <p className="text-sm text-ink-soft">By signing, you confirm you were told about this incident involving {child.first_name}.</p>
      <label className="block"><span className="field-label">Parent&apos;s name</span><input className="field-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <SignaturePad onChange={setSig} />
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full">Sign</button>
    </form>
  );
}
