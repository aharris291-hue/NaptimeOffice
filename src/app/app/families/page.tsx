"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/app/AuthGate";
import Sheet from "@/components/app/Sheet";
import PickupPhoto from "@/components/app/PickupPhoto";
import { shrinkImage, useRoster, type Roster } from "@/lib/app/data";
import { supabase } from "@/lib/app/supabase";
import { ageLabel } from "@/lib/app/time";
import { DAYS, type Child, type Contact, type Family } from "@/lib/app/types";

export default function FamiliesPage() {
  return (
    <Suspense fallback={<p className="text-ink-soft">Loading…</p>}>
      <Families />
    </Suspense>
  );
}

function Families() {
  const params = useSearchParams();
  const router = useRouter();
  const { session } = useApp();
  const { data, error, reload } = useRoster();
  const [adding, setAdding] = useState(params.get("new") === "1");
  const id = params.get("id");

  if (error) return <p className="text-peach-dark">{error}</p>;
  if (!data) return <p className="text-ink-soft">Loading…</p>;

  const family = id ? data.families.find((f) => f.id === id) : null;
  if (family) return <FamilyDetail family={family} data={data} reload={reload} uid={session.user.id} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Families</h1>
        <button className="btn-primary px-4 py-2" onClick={() => setAdding(true)}>+ Add family</button>
      </div>
      {data.families.length === 0 && <p className="card text-ink-soft">No families yet. Add one to get started.</p>}
      <ul className="space-y-2">
        {data.families.map((f) => {
          const kids = data.children.filter((c) => c.family_id === f.id);
          return (
            <li key={f.id}>
              <Link href={`/app/families?id=${f.id}`} className={`card flex items-center justify-between py-3 ${f.active ? "" : "opacity-60"}`}>
                <span>
                  <span className="block font-bold">{f.name}</span>
                  <span className="text-sm text-ink-soft">
                    {kids.length ? kids.map((k) => k.first_name).join(", ") : "No children added"}
                    {!f.active && " · Inactive"}
                  </span>
                </span>
                <span className="text-ink-soft" aria-hidden>›</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {adding && (
        <Sheet title="New family" onClose={() => setAdding(false)}>
          <NewFamily
            uid={session.user.id}
            onDone={async (newId) => {
              setAdding(false);
              await reload();
              router.push(`/app/families?id=${newId}`);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function NewFamily({ uid, onDone }: { uid: string; onDone: (id: string) => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("Enter a family name.");
    setBusy(true);
    const { data, error } = await supabase().from("families").insert({ provider_id: uid, name: name.trim() }).select("id").single();
    setBusy(false);
    if (error) return setErr(error.message);
    onDone(data.id);
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block">
        <span className="field-label">Family name</span>
        <input className="field-input" autoFocus placeholder="e.g. The Garcia family" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="text-sm text-ink-soft">Next you&apos;ll add the children, parents and anyone allowed to pick up.</p>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Create family"}</button>
    </form>
  );
}

function FamilyDetail({ family, data, reload, uid }: { family: Family; data: Roster; reload: () => Promise<void>; uid: string }) {
  const { provider } = useApp();
  const kids = data.children.filter((c) => c.family_id === family.id);
  const people = data.contacts.filter((c) => c.family_id === family.id);
  const [child, setChild] = useState<Partial<Child> | null>(null);
  const [contact, setContact] = useState<Partial<Contact> | null>(null);
  const [editName, setEditName] = useState(false);
  const shareTotal = people.reduce((s, p) => s + Number(p.billing_share || 0), 0);

  async function toggleActive() {
    await supabase().from("families").update({ active: !family.active }).eq("id", family.id);
    reload();
  }

  return (
    <div className="space-y-5">
      <Link href="/app/families" className="text-sm font-semibold text-ink-soft">‹ All families</Link>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{family.name}</h1>
        <button className="text-sm font-semibold text-peach-dark" onClick={() => setEditName(true)}>Edit</button>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Children</h2>
          <button className="text-sm font-bold text-peach-dark" onClick={() => setChild({ schedule_days: ["Mon", "Tue", "Wed", "Thu", "Fri"], rate_type: "weekly", active: true })}>+ Add child</button>
        </div>
        {kids.length === 0 && <p className="card text-sm text-ink-soft">No children yet.</p>}
        {kids.map((c) => (
          <button key={c.id} className={`card w-full py-3 text-left ${c.active ? "" : "opacity-60"}`} onClick={() => setChild(c)}>
            <span className="block font-bold">{c.first_name} {c.last_name} <span className="font-normal text-ink-soft">{ageLabel(c.birth_date)}</span></span>
            <span className="text-sm text-ink-soft">
              {c.schedule_days.join(" ")} · {provider.currency}{Number(c.rate).toFixed(2)} {c.rate_type}
              {c.allergies && <span className="font-semibold text-peach-dark"> · Allergies: {c.allergies}</span>}
            </span>
          </button>
        ))}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Parents and pick-up list</h2>
          <button className="text-sm font-bold text-peach-dark" onClick={() => setContact({ relationship: people.length ? "Grandparent" : "Parent", is_guardian: people.length === 0, can_pickup: true, billing_share: people.length ? 0 : 100 })}>+ Add person</button>
        </div>
        {people.length === 0 && <p className="card text-sm text-ink-soft">Add parents and anyone else allowed to pick up, with a photo so you can check at the door.</p>}
        {people.map((p) => (
          <button key={p.id} className="card flex w-full items-center gap-3 py-3 text-left" onClick={() => setContact(p)}>
            <PickupPhoto path={p.photo_path} name={p.full_name} size={48} />
            <span className="min-w-0">
              <span className="block font-bold">{p.full_name}</span>
              <span className="text-sm text-ink-soft">
                {p.relationship}
                {p.can_pickup ? " · Can pick up" : " · Not allowed to pick up"}
                {Number(p.billing_share) > 0 && ` · Pays ${Number(p.billing_share)}%`}
              </span>
            </span>
          </button>
        ))}
        {people.length > 0 && shareTotal !== 100 && (
          <p className="text-sm font-semibold text-peach-dark">Bill split adds up to {shareTotal}%. Set who pays so it totals 100%.</p>
        )}
      </section>

      <button className="text-sm font-semibold text-ink-soft underline" onClick={toggleActive}>
        {family.active ? "Mark family as no longer enrolled" : "Mark family as enrolled again"}
      </button>

      {editName && (
        <Sheet title="Family details" onClose={() => setEditName(false)}>
          <FamilyForm family={family} onDone={() => { setEditName(false); reload(); }} />
        </Sheet>
      )}
      {child && (
        <Sheet title={child.id ? `Edit ${child.first_name}` : "Add a child"} onClose={() => setChild(null)}>
          <ChildForm initial={child} familyId={family.id} uid={uid} onDone={() => { setChild(null); reload(); }} />
        </Sheet>
      )}
      {contact && (
        <Sheet title={contact.id ? `Edit ${contact.full_name}` : "Add a person"} onClose={() => setContact(null)}>
          <ContactForm initial={contact} familyId={family.id} uid={uid} onDone={() => { setContact(null); reload(); }} />
        </Sheet>
      )}
    </div>
  );
}

function FamilyForm({ family, onDone }: { family: Family; onDone: () => void }) {
  const [name, setName] = useState(family.name);
  const [notes, setNotes] = useState(family.notes);
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from("families").update({ name: name.trim() || family.name, notes }).eq("id", family.id);
    if (error) return setErr(error.message);
    onDone();
  }
  async function remove() {
    if (!confirm(`Delete ${family.name} and all of their attendance records? This can't be undone.`)) return;
    const { error } = await supabase().from("families").delete().eq("id", family.id);
    if (error) return setErr(error.message);
    window.location.href = "/app/families";
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block"><span className="field-label">Family name</span><input className="field-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="block"><span className="field-label">Notes</span><textarea className="field-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full">Save</button>
      <button type="button" className="w-full text-sm font-semibold text-peach-dark" onClick={remove}>Delete family</button>
    </form>
  );
}

function ChildForm({ initial, familyId, uid, onDone }: { initial: Partial<Child>; familyId: string; uid: string; onDone: () => void }) {
  const [c, setC] = useState<Partial<Child>>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Child, v: unknown) => setC((x) => ({ ...x, [k]: v }));
  const days = c.schedule_days ?? [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!c.first_name?.trim()) return setErr("Enter the child's first name.");
    setBusy(true);
    const row = {
      first_name: c.first_name.trim(),
      last_name: (c.last_name ?? "").trim(),
      birth_date: c.birth_date || null,
      schedule_days: DAYS.filter((d) => days.includes(d)),
      rate: Number(c.rate) || 0,
      rate_type: c.rate_type ?? "weekly",
      allergies: c.allergies ?? "",
      notes: c.notes ?? "",
      active: c.active ?? true,
    };
    const sb = supabase();
    const { error } = c.id
      ? await sb.from("children").update(row).eq("id", c.id)
      : await sb.from("children").insert({ ...row, provider_id: uid, family_id: familyId });
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="field-label">First name</span><input className="field-input" value={c.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} /></label>
        <label className="block"><span className="field-label">Last name</span><input className="field-input" value={c.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} /></label>
      </div>
      <label className="block"><span className="field-label">Birth date (for ratio checks)</span><input type="date" className="field-input" value={c.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} /></label>
      <fieldset>
        <legend className="field-label">Usual days</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = days.includes(d);
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => set("schedule_days", on ? days.filter((x) => x !== d) : [...days, d])}
                className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${on ? "border-peach bg-peach-soft" : "border-line text-ink-soft"}`}>
                {d}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="field-label">Rate</span><input inputMode="decimal" className="field-input" value={c.rate ?? ""} onChange={(e) => set("rate", e.target.value)} /></label>
        <label className="block"><span className="field-label">Per</span>
          <select className="field-input" value={c.rate_type ?? "weekly"} onChange={(e) => set("rate_type", e.target.value)}>
            <option value="hourly">Hour</option><option value="daily">Day</option><option value="weekly">Week</option><option value="monthly">Month</option>
          </select>
        </label>
      </div>
      <label className="block"><span className="field-label">Allergies</span><input className="field-input" placeholder="Leave blank if none" value={c.allergies ?? ""} onChange={(e) => set("allergies", e.target.value)} /></label>
      <label className="block"><span className="field-label">Notes</span><textarea className="field-input" rows={2} value={c.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>
      {c.id && (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={c.active ?? true} onChange={(e) => set("active", e.target.checked)} /> Currently enrolled
        </label>
      )}
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
    </form>
  );
}

function ContactForm({ initial, familyId, uid, onDone }: { initial: Partial<Contact>; familyId: string; uid: string; onDone: () => void }) {
  const [c, setC] = useState<Partial<Contact>>(initial);
  const [photo, setPhoto] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Contact, v: unknown) => setC((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!c.full_name?.trim()) return setErr("Enter their full name.");
    setBusy(true);
    const sb = supabase();
    const row = {
      full_name: c.full_name.trim(),
      relationship: c.relationship ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      is_guardian: c.is_guardian ?? false,
      can_pickup: c.can_pickup ?? true,
      billing_share: Math.min(100, Math.max(0, Number(c.billing_share) || 0)),
      id_notes: c.id_notes ?? "",
    };
    const res = c.id
      ? await sb.from("contacts").update(row).eq("id", c.id).select("id").single()
      : await sb.from("contacts").insert({ ...row, provider_id: uid, family_id: familyId }).select("id").single();
    if (res.error) {
      setBusy(false);
      return setErr(res.error.message);
    }
    if (photo) {
      const path = `${uid}/${res.data.id}.jpg`;
      const blob = await shrinkImage(photo);
      const up = await sb.storage.from("pickup-photos").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (up.error) {
        setBusy(false);
        return setErr(`Saved, but the photo didn't upload: ${up.error.message}`);
      }
      await sb.from("contacts").update({ photo_path: path }).eq("id", res.data.id);
    }
    setBusy(false);
    onDone();
  }

  async function remove() {
    if (!c.id || !confirm(`Remove ${c.full_name}?`)) return;
    const sb = supabase();
    if (c.photo_path) await sb.storage.from("pickup-photos").remove([c.photo_path]);
    const { error } = await sb.from("contacts").delete().eq("id", c.id);
    if (error) return setErr(error.message);
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center gap-3">
        <PickupPhoto path={photo ? null : c.photo_path ?? null} name={c.full_name || "?"} size={64} />
        <label className="btn-secondary cursor-pointer px-4 py-2 text-sm">
          {photo ? "Photo chosen ✓" : c.photo_path ? "Change photo" : "Add photo"}
          <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <label className="block"><span className="field-label">Full name</span><input className="field-input" value={c.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} /></label>
      <label className="block"><span className="field-label">Relationship</span><input className="field-input" placeholder="Parent, Grandparent, Nanny…" value={c.relationship ?? ""} onChange={(e) => set("relationship", e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="field-label">Phone</span><input type="tel" className="field-input" value={c.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="block"><span className="field-label">Email</span><input type="email" className="field-input" value={c.email ?? ""} onChange={(e) => set("email", e.target.value)} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={c.can_pickup ?? true} onChange={(e) => set("can_pickup", e.target.checked)} /> Allowed to pick up</label>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={c.is_guardian ?? false} onChange={(e) => set("is_guardian", e.target.checked)} /> Parent or legal guardian</label>
      <label className="block"><span className="field-label">Share of tuition they pay (%)</span><input inputMode="numeric" className="field-input" value={c.billing_share ?? 0} onChange={(e) => set("billing_share", e.target.value)} /></label>
      <label className="block"><span className="field-label">ID check notes</span><input className="field-input" placeholder="e.g. Ask for driver's license" value={c.id_notes ?? ""} onChange={(e) => set("id_notes", e.target.value)} /></label>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      {c.id && <button type="button" className="w-full text-sm font-semibold text-peach-dark" onClick={remove}>Remove person</button>}
    </form>
  );
}
