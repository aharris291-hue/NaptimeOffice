"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app/AuthGate";
import { supabase } from "@/lib/app/supabase";
import type { Provider, RatioRule } from "@/lib/app/types";

const CURRENCIES = ["$", "£", "€", "A$", "C$", "NZ$", "R", "₹"];

export default function SettingsPage() {
  const { provider, reloadProvider } = useApp();
  const router = useRouter();
  const [p, setP] = useState<Provider>(provider);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Provider>(k: K, v: Provider[K]) => setP((x) => ({ ...x, [k]: v }));
  const rules = p.ratio_rules ?? [];
  const setRule = (i: number, r: Partial<RatioRule>) => set("ratio_rules", rules.map((x, j) => (j === i ? { ...x, ...r } : x)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase()
      .from("providers")
      .update({
        provider_name: p.provider_name,
        business_name: p.business_name,
        address: p.address,
        phone: p.phone,
        country: p.country,
        currency: p.currency,
        open_time: p.open_time,
        close_time: p.close_time,
        late_grace_minutes: Number(p.late_grace_minutes) || 0,
        late_fee_amount: Number(p.late_fee_amount) || 0,
        late_fee_per_minutes: Math.max(1, Number(p.late_fee_per_minutes) || 15),
        max_children: Math.max(1, Number(p.max_children) || 1),
        ratio_rules: rules
          .filter((r) => r.label.trim())
          .map((r) => ({ label: r.label.trim(), max_age_months: Number(r.max_age_months) || 0, max_per_adult: Math.max(1, Number(r.max_per_adult) || 1) })),
      })
      .eq("id", p.id);
    setBusy(false);
    if (error) return setMsg(error.message);
    await reloadProvider();
    setMsg("Saved ✓");
  }

  async function signOut() {
    await supabase().auth.signOut();
    router.replace("/login");
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <h1 className="text-2xl font-extrabold">Settings</h1>

      <section className="card space-y-3">
        <h2 className="font-bold">Your daycare</h2>
        <Text label="Daycare name" value={p.business_name} onChange={(v) => set("business_name", v)} />
        <Text label="Your name" value={p.provider_name} onChange={(v) => set("provider_name", v)} />
        <Text label="Address" value={p.address} onChange={(v) => set("address", v)} />
        <Text label="Phone" value={p.phone} onChange={(v) => set("phone", v)} type="tel" />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label">Country</span>
            <select className="field-input" value={p.country} onChange={(e) => set("country", e.target.value)}>
              <option value="US">United States</option><option value="CA">Canada</option><option value="GB">United Kingdom</option>
              <option value="AU">Australia</option><option value="NZ">New Zealand</option><option value="IE">Ireland</option>
              <option value="ZA">South Africa</option><option value="OTHER">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">Currency</span>
            <select className="field-input" value={p.currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Hours and late pick-up</h2>
        <div className="grid grid-cols-2 gap-3">
          <Text label="Open" type="time" value={p.open_time.slice(0, 5)} onChange={(v) => set("open_time", v)} />
          <Text label="Close" type="time" value={p.close_time.slice(0, 5)} onChange={(v) => set("close_time", v)} />
        </div>
        <Text label="Grace period (minutes)" inputMode="numeric" value={String(p.late_grace_minutes)} onChange={(v) => set("late_grace_minutes", v as unknown as number)} />
        <div className="grid grid-cols-2 gap-3">
          <Text label={`Late fee (${p.currency})`} inputMode="decimal" value={String(p.late_fee_amount)} onChange={(v) => set("late_fee_amount", v as unknown as number)} />
          <Text label="For every … minutes" inputMode="numeric" value={String(p.late_fee_per_minutes)} onChange={(v) => set("late_fee_per_minutes", v as unknown as number)} />
        </div>
        <p className="text-sm text-ink-soft">
          Example: closing {p.close_time.slice(0, 5)}, {p.late_grace_minutes} minute grace, {p.currency}{p.late_fee_amount || 0} for every {p.late_fee_per_minutes} minutes. Set the fee to 0 to turn late fees off.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Capacity and ratios</h2>
        <Text label="Most children you're licensed for" inputMode="numeric" value={String(p.max_children)} onChange={(v) => set("max_children", v as unknown as number)} />
        <p className="text-sm text-ink-soft">Add your state or country&apos;s limits so the Today screen warns you. Example: &quot;Under 2&quot;, age under 24 months, 2 per adult.</p>
        {rules.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_5rem_auto] items-end gap-2">
            <Text label="Group" value={r.label} onChange={(v) => setRule(i, { label: v })} />
            <Text label="Under (mo)" inputMode="numeric" value={String(r.max_age_months)} onChange={(v) => setRule(i, { max_age_months: v as unknown as number })} />
            <Text label="Per adult" inputMode="numeric" value={String(r.max_per_adult)} onChange={(v) => setRule(i, { max_per_adult: v as unknown as number })} />
            <button type="button" className="pb-3 text-xl text-ink-soft" aria-label="Remove rule" onClick={() => set("ratio_rules", rules.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="text-sm font-bold text-peach-dark" onClick={() => set("ratio_rules", [...rules, { label: "", max_age_months: 24, max_per_adult: 2 }])}>+ Add a ratio rule</button>
      </section>

      <div className="sticky bottom-24 z-10">
        <button className="btn-primary w-full shadow-lg" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
        {msg && <p className="mt-2 text-center font-semibold">{msg}</p>}
      </div>

      <section className="card space-y-2">
        <p className="text-sm text-ink-soft">Signed in as {provider.email}</p>
        <button type="button" className="btn-secondary w-full" onClick={signOut}>Sign out</button>
      </section>
    </form>
  );
}

function Text(props: { label: string; value: string; onChange: (v: string) => void; type?: string; inputMode?: "numeric" | "decimal" }) {
  return (
    <label className="block">
      <span className="field-label">{props.label}</span>
      <input className="field-input" type={props.type ?? "text"} inputMode={props.inputMode} value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  );
}
