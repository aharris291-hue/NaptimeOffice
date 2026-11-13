"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app/AuthGate";
import Sheet from "@/components/app/Sheet";
import SignaturePad from "@/components/app/SignaturePad";
import PickupPhoto from "@/components/app/PickupPhoto";
import { useAttendance, useRoster } from "@/lib/app/data";
import { supabase } from "@/lib/app/supabase";
import { ageLabel, checkRatios, clock, lateFee, lateMinutes, localDate } from "@/lib/app/time";
import { DAYS, type Attendance, type Child, type Contact, type Provider } from "@/lib/app/types";
import { formatMoney } from "@/lib/pdfKit";

type Action = { child: Child; kind: "in" | "out"; row?: Attendance };

export default function TodayPage() {
  const { provider, session } = useApp();
  const today = localDate();
  const { data, error, reload: reloadRoster } = useRoster();
  const { rows, reload } = useAttendance(today);
  const [action, setAction] = useState<Action | null>(null);
  const [adults, setAdults] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const dayName = DAYS[new Date().getDay()];
  const kids = useMemo(() => (data?.children ?? []).filter((c) => c.active), [data]);
  const scheduled = kids.filter((c) => showAll || c.schedule_days.includes(dayName));
  const openRow = (c: Child) => rows?.find((r) => r.child_id === c.id && r.check_in && !r.check_out);
  const doneRows = (c: Child) => rows?.filter((r) => r.child_id === c.id && r.check_out) ?? [];
  const present = kids.filter((c) => openRow(c));
  const ratio = checkRatios(present, adults, provider.ratio_rules ?? [], provider.max_children);

  if (error) return <p className="text-peach-dark">{error}</p>;
  if (!data || !rows) return <p className="text-ink-soft">Loading…</p>;

  if (kids.length === 0) {
    return (
      <div className="card mt-4 space-y-3 text-center">
        <p className="text-4xl" aria-hidden>👋</p>
        <h1 className="text-2xl font-extrabold">Welcome to Naptime Office</h1>
        <p className="text-ink-soft">Start by adding your first family and their children. It takes about two minutes.</p>
        <Link href="/app/families?new=1" className="btn-primary">Add a family</Link>
        {!provider.business_name && (
          <p className="text-sm text-ink-soft">
            Then add your daycare name and hours in <Link className="font-semibold text-peach-dark" href="/app/settings">Settings</Link>.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Today</h1>
          <p className="text-ink-soft">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <p className="rounded-2xl bg-sage-soft px-3 py-2 text-right text-sm font-bold">
          {present.length} here
          <span className="block font-normal text-ink-soft">of {scheduled.length} expected</span>
        </p>
      </div>

      <div className={`card flex items-center justify-between gap-3 py-3 ${ratio.ok ? "" : "border-peach bg-peach-soft"}`}>
        <div className="text-sm">
          <p className="font-bold">{ratio.ok ? "Ratios OK" : "Check your ratios"}</p>
          {ratio.messages.map((m) => <p key={m} className="text-peach-dark">{m}</p>)}
          {ratio.ok && (provider.ratio_rules?.length ?? 0) === 0 && (
            <Link href="/app/settings" className="text-ink-soft underline">Set your state&apos;s ratio limits</Link>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          Adults
          <button className="h-8 w-8 rounded-full border border-line" onClick={() => setAdults((a) => Math.max(1, a - 1))} aria-label="Fewer adults">−</button>
          <span className="w-4 text-center">{adults}</span>
          <button className="h-8 w-8 rounded-full border border-line" onClick={() => setAdults((a) => a + 1)} aria-label="More adults">+</button>
        </div>
      </div>

      <ul className="space-y-2">
        {scheduled.map((c) => {
          const open = openRow(c);
          const done = doneRows(c);
          return (
            <li key={c.id} className="card flex items-center gap-3 py-3">
              <span className={`h-3 w-3 shrink-0 rounded-full ${open ? "bg-sage" : done.length ? "bg-sun" : "bg-line"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.first_name} {c.last_name}</p>
                <p className="truncate text-sm text-ink-soft">
                  {open ? `In at ${clock(open.check_in)} by ${open.in_by}` : done.length ? `Went home ${clock(done[done.length - 1].check_out)}` : ageLabel(c.birth_date) || "Not here yet"}
                  {c.allergies && <span className="ml-1 font-semibold text-peach-dark">· Allergy</span>}
                </p>
              </div>
              {open ? (
                <button className="btn-secondary px-4 py-2" onClick={() => setAction({ child: c, kind: "out", row: open })}>Sign out</button>
              ) : (
                <button className="btn-primary px-4 py-2" onClick={() => setAction({ child: c, kind: "in" })}>Sign in</button>
              )}
            </li>
          );
        })}
      </ul>
      <button className="w-full text-sm font-semibold text-ink-soft" onClick={() => setShowAll((s) => !s)}>
        {showAll ? "Show only today's schedule" : "Show all children (drop-ins)"}
      </button>

      {action && (
        <CheckSheet
          action={action}
          contacts={data.contacts.filter((k) => k.family_id === action.child.family_id && k.can_pickup)}
          onClose={() => setAction(null)}
          onSaved={() => {
            setAction(null);
            reload();
            reloadRoster();
          }}
          providerId={session.user.id}
          provider={provider}
          today={today}
        />
      )}
    </div>
  );
}

function CheckSheet(props: {
    action: Action;
    contacts: Contact[];
    onClose: () => void;
    onSaved: () => void;
    providerId: string;
    provider: Provider;
    today: string;
  }) {
    const { action, contacts, provider, today } = props;
    const [who, setWho] = useState(contacts[0]?.full_name ?? "");
    const [other, setOther] = useState("");
    const [sig, setSig] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const now = new Date();
    const lateMin = action.kind === "out" ? lateMinutes(now, provider) : 0;
    const fee = lateFee(lateMin, provider);
    const name = who === "__other" ? other.trim() : who;
    const picked = contacts.find((k) => k.full_name === who);

    async function save() {
      setErr(null);
      if (!name) return setErr("Choose who is signing.");
      if (!sig) return setErr("Ask them to sign in the box.");
      setBusy(true);
      const sb = supabase();
      const res =
        action.kind === "in"
          ? await sb.from("attendance").insert({
              provider_id: props.providerId,
              child_id: action.child.id,
              care_date: today,
              check_in: now.toISOString(),
              in_by: name,
              in_signature: sig,
            })
          : await sb
              .from("attendance")
              .update({ check_out: now.toISOString(), out_by: name, out_signature: sig, late_minutes: lateMin, late_fee: fee })
              .eq("id", action.row!.id);
      setBusy(false);
      if (res.error) return setErr(res.error.message);
      props.onSaved();
    }

    return (
      <Sheet title={`${action.kind === "in" ? "Sign in" : "Sign out"} ${action.child.first_name}`} onClose={props.onClose}>
        <div className="space-y-4">
          {action.kind === "out" && contacts.length > 0 && (
            <p className="text-sm text-ink-soft">Only people on this family&apos;s approved pick-up list are shown. Check the photo before handing over.</p>
          )}
          <div className="space-y-2">
            {contacts.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setWho(k.full_name)}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 p-2 text-left ${who === k.full_name ? "border-peach bg-peach-soft" : "border-line"}`}
              >
                <PickupPhoto path={k.photo_path} name={k.full_name} size={action.kind === "out" ? 64 : 40} />
                <span>
                  <span className="block font-bold">{k.full_name}</span>
                  <span className="text-sm text-ink-soft">{k.relationship}{k.id_notes ? ` · ${k.id_notes}` : ""}</span>
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setWho("__other")}
              className={`w-full rounded-2xl border-2 p-3 text-left font-semibold ${who === "__other" ? "border-peach bg-peach-soft" : "border-line text-ink-soft"}`}
            >
              Someone else
            </button>
            {who === "__other" && (
              <>
                <input className="field-input" placeholder="Their full name" value={other} onChange={(e) => setOther(e.target.value)} />
                {action.kind === "out" && (
                  <p className="rounded-xl bg-peach-soft px-3 py-2 text-sm font-semibold text-peach-dark">
                    This person isn&apos;t on the approved pick-up list. Confirm with a parent before releasing {action.child.first_name}.
                  </p>
                )}
              </>
            )}
          </div>
          {picked && action.kind === "out" && !picked.can_pickup && (
            <p className="text-peach-dark">Not approved for pick-up.</p>
          )}
          <SignaturePad onChange={setSig} />
          {fee > 0 && (
            <p className="rounded-xl bg-sun/30 px-3 py-2 text-sm font-semibold">
              {lateMin} minutes past closing. A late fee of {formatMoney(fee, provider.currency)} will be added to this family&apos;s next invoice.
            </p>
          )}
          {err && <p className="font-semibold text-peach-dark">{err}</p>}
          <button className="btn-primary w-full" disabled={busy} onClick={save}>
            {busy ? "Saving…" : `Confirm ${action.kind === "in" ? "sign-in" : "sign-out"} at ${clock(now.toISOString())}`}
          </button>
        </div>
      </Sheet>
    );
  }
