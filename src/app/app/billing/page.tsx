"use client";

import { useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app/AuthGate";
import Sheet from "@/components/app/Sheet";
import { useBilling, useRoster, type Roster } from "@/lib/app/data";
import { supabase } from "@/lib/app/supabase";
import { localDate } from "@/lib/app/time";
import {
  familyBalance,
  familyDrafts,
  invoicePdf,
  itemsTotal,
  paidOn,
  periodPresets,
  receiptPdf,
  shareOrDownload,
  shareTotal,
  type Draft,
} from "@/lib/app/billing";
import type { Attendance, Family, Invoice, Payment, Provider } from "@/lib/app/types";
import { formatMoney, prettyDate } from "@/lib/pdfKit";
import { METHODS } from "@/lib/receipt";

type Billing = { invoices: Invoice[]; payments: Payment[] };

export default function BillingPage() {
  const { provider } = useApp();
  const roster = useRoster();
  const billing = useBilling();
  const [creating, setCreating] = useState(false);
  const [familyId, setFamilyId] = useState<string | null>(null);

  const error = roster.error || billing.error;
  if (error) return <p className="text-peach-dark">{error}</p>;
  if (!roster.data || !billing.data) return <p className="text-ink-soft">Loading…</p>;
  const r = roster.data;
  const b = billing.data;
  const money = (n: number) => formatMoney(n, provider.currency);
  const reloadAll = () => { billing.reload(); roster.reload(); };

  const families = r.families
    .map((f) => ({ f, balance: familyBalance(f.id, b.invoices, b.payments) }))
    .filter(({ f, balance }) => f.active || balance !== 0);
  const owed = families.reduce((s, x) => s + Math.max(0, x.balance), 0);
  const thisMonth = localDate().slice(0, 7);
  const collected = b.payments.filter((p) => p.paid_on.startsWith(thisMonth)).reduce((s, p) => s + Number(p.amount), 0);
  const family = familyId ? r.families.find((f) => f.id === familyId) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Billing</h1>
      <div className="grid grid-cols-2 gap-3">
        <div className="card py-3">
          <p className="text-sm text-ink-soft">Families owe you</p>
          <p className="text-2xl font-extrabold">{money(owed)}</p>
        </div>
        <div className="card py-3">
          <p className="text-sm text-ink-soft">Collected this month</p>
          <p className="text-2xl font-extrabold text-sage">{money(collected)}</p>
        </div>
      </div>
      <button className="btn-primary w-full" onClick={() => setCreating(true)} disabled={r.families.length === 0}>Create invoices</button>
      {r.families.length === 0 && (
        <p className="text-sm text-ink-soft">Add a family with a rate in <Link className="font-semibold text-peach-dark" href="/app/families">Families</Link> first.</p>
      )}
      {!provider.payment_info && r.families.length > 0 && (
        <p className="text-sm text-ink-soft">
          Tip: add how parents can pay you (Venmo, Zelle, check) in <Link className="font-semibold text-peach-dark" href="/app/settings">Settings</Link> so it prints on every invoice.
        </p>
      )}
      <ul className="space-y-2">
        {families.map(({ f, balance }) => (
          <li key={f.id}>
            <button className="card flex w-full items-center justify-between py-3 text-left" onClick={() => setFamilyId(f.id)}>
              <span className="font-bold">{f.name}</span>
              <span className={`font-bold ${balance > 0 ? "text-peach-dark" : balance < 0 ? "text-sage" : "text-ink-soft"}`}>
                {balance > 0 ? `Owes ${money(balance)}` : balance < 0 ? `${money(-balance)} credit` : "Paid up"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {creating && (
        <Sheet title="Create invoices" onClose={() => setCreating(false)}>
          <CreateInvoices roster={r} provider={provider} onDone={() => { setCreating(false); reloadAll(); }} />
        </Sheet>
      )}
      {family && (
        <Sheet title={family.name} onClose={() => setFamilyId(null)}>
          <FamilyBilling family={family} roster={r} billing={b} provider={provider} reload={reloadAll} />
        </Sheet>
      )}
    </div>
  );
}

function CreateInvoices({ roster, provider, onDone }: { roster: Roster; provider: Provider; onDone: () => void }) {
  const presets = periodPresets();
  const [period, setPeriod] = useState({ start: presets[0].start, end: presets[0].end });
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, provider.currency);

  async function preview() {
    setErr(null);
    if (period.end < period.start) return setErr("The end date is before the start date.");
    setBusy(true);
    const sb = supabase();
    const [inPeriod, fees] = await Promise.all([
      sb.from("attendance").select("*").gte("care_date", period.start).lte("care_date", period.end),
      // Every late fee up to the end of the period that hasn't been billed yet, so billing in advance still catches them.
      sb.from("attendance").select("*").gt("late_fee", 0).is("late_fee_invoice_id", null).lte("care_date", period.end),
    ]);
    setBusy(false);
    const error = inPeriod.error || fees.error;
    if (error) return setErr(error.message);
    const rows = inPeriod.data as Attendance[];
    const unbilled = fees.data as Attendance[];
    setDrafts(roster.families.filter((f) => f.active).flatMap((f) => familyDrafts(f, roster.children, roster.contacts, rows, unbilled, period)));
  }

  function update(key: string, fn: (d: Draft) => Draft) {
    setDrafts((ds) => ds!.map((d) => (d.key === key ? fn(d) : d)));
  }

  async function save() {
    const chosen = drafts!.filter((d) => d.include && itemsTotal(d.items) > 0);
    if (!chosen.length) return setErr("Nothing to invoice. Tick at least one family with charges.");
    setBusy(true);
    const sb = supabase();
    const num = await sb.rpc("take_invoice_numbers", { how_many: chosen.length });
    if (num.error) { setBusy(false); return setErr(num.error.message); }
    const first = Number(num.data);
    const issue = localDate();
    const due = new Date();
    due.setDate(due.getDate() + (provider.invoice_terms_days ?? 7));
    const rows = chosen.map((d, i) => ({
      provider_id: provider.id,
      family_id: d.family.id,
      contact_id: d.contact_id,
      bill_to: d.bill_to,
      number: String(first + i),
      period_start: period.start,
      period_end: period.end,
      issue_date: issue,
      due_date: localDate(due),
      items: d.items.filter((it) => Number(it.qty) && it.description.trim()).map((it) => ({ description: it.description.trim(), qty: Number(it.qty), rate: Number(it.rate) })),
      share: d.share,
      total: shareTotal(d.items, d.share),
    }));
    const { data: saved, error } = await sb.from("invoices").insert(rows).select("id, family_id");
    if (error) { setBusy(false); return setErr(error.message); }
    // Mark late fees as billed, against the family's first new invoice.
    const marked = new Set<string>();
    for (const d of chosen) {
      const inv = saved!.find((x) => x.family_id === d.family.id);
      const ids = d.feeRows.filter((id) => !marked.has(id));
      const keptFees = d.items.some((it) => it.description.startsWith("Late pick-up fees"));
      if (!inv || !ids.length || !keptFees) continue;
      ids.forEach((id) => marked.add(id));
      await sb.from("attendance").update({ late_fee_invoice_id: inv.id }).in("id", ids);
    }
    setBusy(false);
    onDone();
  }

  if (!drafts) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">Pick the care period. Weekly and monthly rates use the period length; daily and hourly rates use your attendance records (or the schedule, for a period that hasn&apos;t happened yet). Late fees are added automatically.</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const on = p.start === period.start && p.end === period.end;
            return (
              <button key={p.label} type="button" onClick={() => setPeriod({ start: p.start, end: p.end })}
                className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${on ? "border-peach bg-peach-soft" : "border-line text-ink-soft"}`}>
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="field-label">From</span><input type="date" className="field-input" value={period.start} onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))} /></label>
          <label className="block"><span className="field-label">To</span><input type="date" className="field-input" value={period.end} onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))} /></label>
        </div>
        {err && <p className="font-semibold text-peach-dark">{err}</p>}
        <button className="btn-primary w-full" onClick={preview} disabled={busy}>{busy ? "Working it out…" : "Preview invoices"}</button>
      </div>
    );
  }

  const count = drafts.filter((d) => d.include && itemsTotal(d.items) > 0).length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">{prettyDate(period.start)} to {prettyDate(period.end)}. Check each one, change anything you need, then save.</p>
      {drafts.length === 0 && <p className="card text-ink-soft">No enrolled families yet.</p>}
      {drafts.map((d) => (
        <div key={d.key} className={`rounded-2xl border-2 p-3 ${d.include ? "border-peach" : "border-line opacity-70"}`}>
          <label className="flex items-center justify-between gap-2">
            <span>
              <span className="block font-bold">{d.family.name}</span>
              <span className="text-sm text-ink-soft">To {d.bill_to}{d.share < 100 ? ` · pays ${d.share}%` : ""}</span>
            </span>
            <input type="checkbox" className="h-5 w-5" checked={d.include} onChange={(e) => update(d.key, (x) => ({ ...x, include: e.target.checked }))} />
          </label>
          {d.include && (
            <div className="mt-2 space-y-2">
              {d.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_3.5rem_5rem_auto] items-center gap-1">
                  <input className="field-input py-2 text-sm" value={it.description} aria-label="Description"
                    onChange={(e) => update(d.key, (x) => ({ ...x, items: x.items.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)) }))} />
                  <input className="field-input py-2 text-sm" inputMode="decimal" value={it.qty} aria-label="Quantity"
                    onChange={(e) => update(d.key, (x) => ({ ...x, items: x.items.map((y, j) => (j === i ? { ...y, qty: e.target.value as unknown as number } : y)) }))} />
                  <input className="field-input py-2 text-sm" inputMode="decimal" value={it.rate} aria-label="Rate"
                    onChange={(e) => update(d.key, (x) => ({ ...x, items: x.items.map((y, j) => (j === i ? { ...y, rate: e.target.value as unknown as number } : y)) }))} />
                  <button type="button" className="px-1 text-xl text-ink-soft" aria-label="Remove line"
                    onClick={() => update(d.key, (x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}>×</button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button type="button" className="text-sm font-bold text-peach-dark"
                  onClick={() => update(d.key, (x) => ({ ...x, items: [...x.items, { description: "", qty: 1, rate: 0 }] }))}>+ Add a line</button>
                <span className="font-bold">{money(shareTotal(d.items, d.share))}</span>
              </div>
              <p className="text-xs text-ink-soft">Use a negative rate for a discount or credit.</p>
            </div>
          )}
        </div>
      ))}
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={() => setDrafts(null)}>Back</button>
        <button className="btn-primary flex-1" onClick={save} disabled={busy || count === 0}>{busy ? "Saving…" : `Save ${count} invoice${count === 1 ? "" : "s"}`}</button>
      </div>
    </div>
  );
}

function FamilyBilling({ family, roster, billing, provider, reload }: { family: Family; roster: Roster; billing: Billing; provider: Provider; reload: () => void }) {
  const invoices = billing.invoices.filter((i) => i.family_id === family.id);
  const payments = billing.payments.filter((p) => p.family_id === family.id);
  const kids = roster.children.filter((c) => c.family_id === family.id);
  const people = roster.contacts.filter((c) => c.family_id === family.id);
  const [paying, setPaying] = useState<Invoice | "any" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, provider.currency);
  const balance = familyBalance(family.id, billing.invoices, billing.payments);

  async function sendInvoice(inv: Invoice) {
    setErr(null);
    try {
      const { blob, name } = await invoicePdf(inv, provider, family, kids, people.find((p) => p.id === inv.contact_id), paidOn(inv, billing.payments));
      await shareOrDownload(blob, name, `Invoice #${inv.number} from ${provider.business_name || provider.provider_name}`);
    } catch (e) { setErr((e as Error).message); }
  }

  async function sendReceipt(p: Payment) {
    setErr(null);
    try {
      const { blob, name } = await receiptPdf(p, provider, family, kids, invoices.find((i) => i.id === p.invoice_id));
      await shareOrDownload(blob, name, `Payment receipt from ${provider.business_name || provider.provider_name}`);
    } catch (e) { setErr((e as Error).message); }
  }

  async function voidInvoice(inv: Invoice) {
    if (!confirm(`Cancel invoice #${inv.number}? It will no longer count toward what ${family.name} owes.`)) return;
    const { error } = await supabase().from("invoices").update({ status: "void" }).eq("id", inv.id);
    if (error) return setErr(error.message);
    reload();
  }

  async function deletePayment(p: Payment) {
    if (!confirm(`Delete the ${money(Number(p.amount))} payment from ${prettyDate(p.paid_on)}?`)) return;
    const { error } = await supabase().from("payments").delete().eq("id", p.id);
    if (error) return setErr(error.message);
    reload();
  }

  if (paying) {
    const inv = paying === "any" ? undefined : paying;
    return <RecordPayment family={family} invoice={inv} owed={inv ? Number(inv.total) - paidOn(inv, billing.payments) : Math.max(0, balance)} people={people.map((p) => p.full_name)} provider={provider}
      onCancel={() => setPaying(null)} onDone={() => { setPaying(null); reload(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-lg font-extrabold ${balance > 0 ? "text-peach-dark" : "text-sage"}`}>
          {balance > 0 ? `Owes ${money(balance)}` : balance < 0 ? `${money(-balance)} credit` : "All paid up"}
        </p>
        <button className="btn-primary px-4 py-2" onClick={() => setPaying("any")}>Record payment</button>
      </div>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}

      <section className="space-y-2">
        <h3 className="font-bold">Invoices</h3>
        {invoices.length === 0 && <p className="text-sm text-ink-soft">No invoices yet.</p>}
        {invoices.map((inv) => {
          const paid = paidOn(inv, billing.payments);
          const left = Math.round((Number(inv.total) - paid) * 100) / 100;
          return (
            <div key={inv.id} className={`rounded-2xl border border-line p-3 ${inv.status === "void" ? "opacity-50" : ""}`}>
              <div className="flex justify-between">
                <span className="font-bold">#{inv.number} · {inv.bill_to}</span>
                <span className="font-bold">{money(Number(inv.total))}</span>
              </div>
              <p className="text-sm text-ink-soft">
                {prettyDate(inv.period_start)} to {prettyDate(inv.period_end)}
                {inv.status === "void" ? " · Cancelled" : left <= 0 ? " · Paid" : paid > 0 ? ` · ${money(left)} left` : inv.due_date ? ` · Due ${prettyDate(inv.due_date)}` : ""}
              </p>
              {inv.status === "open" && (
                <div className="mt-2 flex flex-wrap gap-3 text-sm font-bold">
                  <button className="text-peach-dark" onClick={() => sendInvoice(inv)}>Send PDF</button>
                  {left > 0 && <button className="text-sage" onClick={() => setPaying(inv)}>Mark paid</button>}
                  <button className="text-ink-soft" onClick={() => voidInvoice(inv)}>Cancel</button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">Payments</h3>
        {payments.length === 0 && <p className="text-sm text-ink-soft">No payments recorded yet.</p>}
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-2xl border border-line p-3">
            <span>
              <span className="block font-bold">{money(Number(p.amount))} · {p.method}</span>
              <span className="text-sm text-ink-soft">{prettyDate(p.paid_on)}{p.paid_by ? ` · ${p.paid_by}` : ""}{p.reference ? ` · ${p.reference}` : ""}</span>
            </span>
            <span className="flex flex-col items-end gap-1 text-sm font-bold">
              <button className="text-peach-dark" onClick={() => sendReceipt(p)}>Receipt</button>
              <button className="text-ink-soft" onClick={() => deletePayment(p)}>Delete</button>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

function RecordPayment(props: { family: Family; invoice?: Invoice; owed: number; people: string[]; provider: Provider; onCancel: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(props.owed > 0 ? String(Math.round(props.owed * 100) / 100) : "");
  const [paidBy, setPaidBy] = useState(props.invoice?.bill_to || props.people[0] || "");
  const [method, setMethod] = useState("Zelle");
  const [date, setDate] = useState(localDate());
  const [reference, setReference] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return setErr("Enter the amount received.");
    setBusy(true);
    const { error } = await supabase().from("payments").insert({
      provider_id: props.provider.id,
      family_id: props.family.id,
      invoice_id: props.invoice?.id ?? null,
      paid_by: paidBy.trim(),
      amount: Math.round(n * 100) / 100,
      paid_on: date,
      method,
      reference: reference.trim(),
    });
    setBusy(false);
    if (error) return setErr(error.message);
    props.onDone();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="font-bold">{props.invoice ? `Payment for invoice #${props.invoice.number}` : `Payment from ${props.family.name}`}</p>
      <label className="block"><span className="field-label">Amount ({props.provider.currency})</span><input className="field-input" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="block">
        <span className="field-label">Paid by</span>
        <input className="field-input" list="payers" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} />
        <datalist id="payers">{props.people.map((p) => <option key={p} value={p} />)}</datalist>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="field-label">How</span>
          <select className="field-input" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="block"><span className="field-label">Date</span><input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <label className="block"><span className="field-label">Check # or note (optional)</span><input className="field-input" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={props.onCancel}>Back</button>
        <button className="btn-primary flex-1" disabled={busy}>{busy ? "Saving…" : "Save payment"}</button>
      </div>
    </form>
  );
}
